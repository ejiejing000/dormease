const { pool } = require('../config/db');
const { where, inList, limit } = require('./query');
const { canAccessHouse } = require('../utils/scope');
const { httpError } = require('../utils/validate');

const SELECT = `SELECT tn.*, te.full_name AS tenant_name, te.email AS tenant_email, te.user_id AS tenant_user_id,
    r.room_number, r.house_id, r.monthly_rent, r.bed_capacity, h.name AS house_name,
    (SELECT COUNT(*) FROM bills b WHERE b.tenancy_id = tn.id) AS bill_count
  FROM tenancies tn
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
  if (filters.status) { conditions.push('tn.status = ?'); params.push(filters.status); }
  if (filters.tenantId) { conditions.push('tn.tenant_id = ?'); params.push(Number(filters.tenantId)); }
  const [rows] = await pool.query(`${SELECT}${where(conditions)} ORDER BY tn.id DESC LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

exports.byIdForUser = async (id, user) => {
  const [rows] = await pool.execute(`${SELECT} WHERE tn.id = ?`, [id]);
  const tenancy = rows[0];
  if (!tenancy) return null;
  if (user.role === 'staff' && !user.houseIds.includes(tenancy.house_id)) return null;
  if (user.role === 'tenant' && tenancy.tenant_user_id !== user.id && tenancy.tenant_id !== user.tenantId) return null;
  if (user.role === 'landlord' && !(await canAccessHouse(user, tenancy.house_id))) return null;
  return tenancy;
};

exports.activeForTenant = async (tenantId) => {
  const [rows] = await pool.execute(`${SELECT} WHERE tn.tenant_id = ? AND tn.status = 'active' ORDER BY tn.id DESC`, [tenantId]);
  return rows;
};

exports.roommates = async (tenancyId) => {
  const [rows] = await pool.execute(
    `SELECT te.full_name FROM tenancies tn
     JOIN tenants te ON te.id = tn.tenant_id
     WHERE tn.room_id = (SELECT room_id FROM tenancies WHERE id = ?) AND tn.status = 'active'`, [tenancyId]);
  return rows;
};

// Lease register report: INNER JOIN across tenancies, tenants, rooms and houses.
// Every row is a lease that resolves to a real tenant, room and house.
exports.register = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`h.id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else if (user.role === 'tenant') {
    if (!user.tenantId) return [];
    conditions.push('tn.tenant_id = ?');
    params.push(user.tenantId);
  } else {
    return [];
  }
  if (filters.houseId) { conditions.push('h.id = ?'); params.push(Number(filters.houseId)); }
  if (filters.status) { conditions.push('tn.status = ?'); params.push(filters.status); }
  if (filters.from) { conditions.push('tn.start_date >= ?'); params.push(filters.from); }
  if (filters.to) { conditions.push('tn.start_date <= ?'); params.push(filters.to); }
  const [rows] = await pool.query(
    `SELECT tn.id AS tenancy_id, te.id AS tenant_id, te.full_name AS tenant_name, te.email AS tenant_email,
            r.id AS room_id, r.room_number, h.id AS house_id, h.name AS house_name, h.address AS house_address,
            tn.start_date, tn.end_date, tn.status, tn.occupants, r.monthly_rent,
            (r.monthly_rent * tn.occupants) AS monthly_value
     FROM tenancies tn
     INNER JOIN tenants te ON te.id = tn.tenant_id
     INNER JOIN rooms r ON r.id = tn.room_id
     INNER JOIN houses h ON h.id = r.house_id
     ${where(conditions)}
     ORDER BY h.name, r.room_number, te.full_name LIMIT ${limit(filters.limit, 500)}`, params);
  return rows;
};

exports.create = async ({ tenant_id, room_id, start_date, occupants = 1 }, user) => {
  const [rooms] = await pool.execute('SELECT id, bed_capacity, house_id FROM rooms WHERE id = ?', [room_id]);
  if (!rooms[0]) throw httpError(404, 'Room not found');
  const [used] = await pool.execute(
    `SELECT COALESCE(SUM(occupants),0) AS occupied FROM tenancies
     WHERE room_id = ? AND status = 'active' AND (end_date IS NULL OR end_date >= CURDATE())`, [room_id]);
  const people = Math.max(1, Number(occupants) || 1);
  if (Number(used[0].occupied) + people > Number(rooms[0].bed_capacity)) {
    throw httpError(409, 'Room is already at bed capacity for the requested date');
  }
  const [result] = await pool.execute(
    `INSERT INTO tenancies (tenant_id, room_id, start_date, occupants, status) VALUES (?,?,?,?,'active')`,
    [tenant_id, room_id, start_date, people]);
  await pool.execute(
    `UPDATE reservations SET status='approved' WHERE tenant_id=? AND room_id=? AND status IN ('pending','held')`,
    [tenant_id, room_id]);
  return exports.byIdForUser(result.insertId, user);
};

exports.patch = async (id, data, user) => {
  const tenancy = await exports.byIdForUser(id, user);
  if (!tenancy) throw httpError(404, 'Tenancy not found');
  if (data.end_date !== undefined || data.status === 'ended') {
    await pool.execute(`UPDATE tenancies SET status='ended', end_date = COALESCE(?, CURDATE()) WHERE id = ?`,
      [data.end_date ?? null, id]);
  }
  if (data.occupants !== undefined) {
    await pool.execute('UPDATE tenancies SET occupants = ? WHERE id = ?', [Math.max(1, Number(data.occupants)), id]);
  }
  return exports.byIdForUser(id, user);
};
