const { pool } = require('../config/db');
const { where, inList, limit } = require('./query');
const { httpError } = require('../utils/validate');
const { canAccessHouse } = require('../utils/scope');

const SELECT = `SELECT mr.*, ut.code AS utility_code, ut.name AS utility_name,
    r.house_id, r.room_number, te.full_name AS tenant_name,
    (mr.current_reading - mr.previous_reading) AS units_used
  FROM meter_readings mr
  JOIN utility_types ut ON ut.id = mr.utility_type_id
  JOIN tenancies tn ON tn.id = mr.tenancy_id
  JOIN tenants te ON te.id = tn.tenant_id
  JOIN rooms r ON r.id = tn.room_id
  JOIN houses h ON h.id = r.house_id`;

exports.listForUser = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`r.house_id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else if (user.role === 'tenant') {
    if (!user.tenantId) return [];
    conditions.push('tn.tenant_id = ?');
    params.push(user.tenantId);
  }
  if (filters.tenancyId) { conditions.push('mr.tenancy_id = ?'); params.push(Number(filters.tenancyId)); }
  if (filters.houseId) { conditions.push('r.house_id = ?'); params.push(Number(filters.houseId)); }
  if (filters.period) { conditions.push('mr.reading_period = ?'); params.push(filters.period); }
  const [rows] = await pool.query(`${SELECT}${where(conditions)}
    ORDER BY mr.reading_period DESC, mr.id DESC LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

exports.lastReading = async (tenancyId, utilityTypeId) => {
  const [rows] = await pool.execute(
    `SELECT current_reading FROM meter_readings
     WHERE tenancy_id = ? AND utility_type_id = ? ORDER BY reading_period DESC, id DESC LIMIT 1`,
    [tenancyId, utilityTypeId]);
  return rows[0] ? Number(rows[0].current_reading) : null;
};

exports.create = async ({ tenancy_id, utility_code, utility_type_id, reading_period, previous_reading, current_reading }, user) => {
  let typeId = utility_type_id;
  if (!typeId && utility_code) {
    const [types] = await pool.execute('SELECT id FROM utility_types WHERE code = ?', [utility_code.toUpperCase()]);
    if (!types[0]) throw httpError(400, `Unknown utility type ${utility_code}`);
    typeId = types[0].id;
  }
  if (!typeId) throw httpError(400, 'utility_code or utility_type_id is required');
  const [tenancies] = await pool.execute(
    `SELECT tn.id, tn.status, r.house_id FROM tenancies tn JOIN rooms r ON r.id = tn.room_id WHERE tn.id = ?`, [tenancy_id]);
  const tenancy = tenancies[0];
  if (!tenancy) throw httpError(404, 'Tenancy not found');
  if (!await canAccessHouse(user, tenancy.house_id)) throw httpError(404, 'Tenancy not found');
  if (tenancy.status !== 'active') throw httpError(409, 'Readings can only be recorded for an active tenancy');

  const previous = previous_reading === undefined || previous_reading === null || previous_reading === ''
    ? await exports.lastReading(tenancy_id, typeId)
    : Number(previous_reading);
  if (previous === null) throw httpError(400, 'previous_reading is required when no earlier reading exists');
  if (Number(current_reading) < Number(previous)) throw httpError(400, 'current_reading must be at least previous_reading');

  await pool.execute(
    `INSERT INTO meter_readings (tenancy_id, utility_type_id, reading_period, previous_reading, current_reading, recorded_by)
     VALUES (?,?,?,?,?,?)`, [tenancy_id, typeId, reading_period, Number(previous), Number(current_reading), user.id]);
  const [rows] = await pool.execute(`${SELECT} WHERE mr.tenancy_id = ? AND mr.utility_type_id = ? AND mr.reading_period = ?`,
    [tenancy_id, typeId, reading_period]);
  return rows[0];
};
