const { pool } = require('../config/db');
const { where, inList, limit } = require('./query');
const { httpError } = require('../utils/validate');

exports.listForUser = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`ur.house_id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else {
    return [];
  }
  if (filters.houseId) { conditions.push('ur.house_id = ?'); params.push(Number(filters.houseId)); }
  if (filters.utilityCode) { conditions.push('ut.code = ?'); params.push(filters.utilityCode); }
  const [rows] = await pool.query(
    `SELECT ur.*, ut.code, ut.name AS utility_name, h.name AS house_name,
            (SELECT COUNT(*) FROM rate_tiers rt WHERE rt.utility_rate_id = ur.id) AS tier_count
     FROM utility_rates ur
     JOIN utility_types ut ON ut.id = ur.utility_type_id
     JOIN houses h ON h.id = ur.house_id${where(conditions)}
     ORDER BY ur.effective_from DESC, ur.id DESC LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

exports.tiers = async (rateId) => {
  const [rows] = await pool.execute(
    'SELECT id, lower_units, upper_units, price_per_unit FROM rate_tiers WHERE utility_rate_id = ? ORDER BY lower_units', [rateId]);
  return rows;
};

exports.byId = async (id) => {
  const [rows] = await pool.execute(
    `SELECT ur.*, ut.code FROM utility_rates ur JOIN utility_types ut ON ut.id = ur.utility_type_id WHERE ur.id = ?`, [id]);
  return rows[0] || null;
};

exports.create = async ({ house_id, utility_code, utility_type_id, fixed_charge, effective_from, tiers = [] }) => {
  let typeId = utility_type_id;
  if (!typeId && utility_code) {
    const [types] = await pool.execute('SELECT id FROM utility_types WHERE code = ?', [utility_code.toUpperCase()]);
    if (!types[0]) throw httpError(400, `Unknown utility type ${utility_code}`);
    typeId = types[0].id;
  }
  if (!typeId) throw httpError(400, 'utility_code or utility_type_id is required');
  const [result] = await pool.execute(
    'INSERT INTO utility_rates (house_id, utility_type_id, fixed_charge, effective_from) VALUES (?,?,?,?)',
    [house_id, typeId, Number(fixed_charge || 0), effective_from]);
  for (const tier of tiers) {
    await pool.execute('INSERT INTO rate_tiers (utility_rate_id, lower_units, upper_units, price_per_unit) VALUES (?,?,?,?)',
      [result.insertId, Number(tier.lower_units), tier.upper_units ?? null, Number(tier.price_per_unit)]);
  }
  return exports.byId(result.insertId);
};

exports.addTier = async (rateId, tier) => {
  await pool.execute('INSERT INTO rate_tiers (utility_rate_id, lower_units, upper_units, price_per_unit) VALUES (?,?,?,?)',
    [rateId, Number(tier.lower_units), tier.upper_units ?? null, Number(tier.price_per_unit)]);
  return exports.tiers(rateId);
};

exports.utilityTypes = async () => {
  const [rows] = await pool.execute('SELECT id, code, name FROM utility_types ORDER BY name');
  return rows;
};
