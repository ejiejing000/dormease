const { pool } = require('../config/db');
const { where, inList, limit } = require('./query');
const { httpError } = require('../utils/validate');

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
    conditions.push('w.tenant_id = ?');
    params.push(user.tenantId);
  }
  if (filters.status) { conditions.push('w.status = ?'); params.push(filters.status); }
  const [rows] = await pool.query(
    `SELECT w.*, te.full_name AS tenant_name, r.room_number, r.house_id, h.name AS house_name
     FROM waitlist w JOIN tenants te ON te.id = w.tenant_id
     JOIN rooms r ON r.id = w.room_id JOIN houses h ON h.id = r.house_id${where(conditions)}
     ORDER BY w.status, w.created_at LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

exports.create = async ({ tenant_id, room_id }) => {
  const [rooms] = await pool.execute('SELECT id FROM rooms WHERE id = ?', [room_id]);
  if (!rooms[0]) throw httpError(404, 'Room not found');
  const [tenants] = await pool.execute('SELECT id FROM tenants WHERE id = ?', [tenant_id]);
  if (!tenants[0]) throw httpError(404, 'Tenant not found');
  const [existing] = await pool.execute(
    "SELECT id FROM waitlist WHERE tenant_id = ? AND room_id = ? AND status IN ('waiting','notified')", [tenant_id, room_id]);
  if (existing[0]) return { id: existing[0].id, existing: true };
  const [result] = await pool.execute('INSERT INTO waitlist (tenant_id, room_id) VALUES (?,?)', [tenant_id, room_id]);
  const [rows] = await pool.execute('SELECT * FROM waitlist WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.setStatus = async (id, status, user) => {
  if (!['waiting', 'notified', 'fulfilled', 'cancelled'].includes(status)) throw httpError(400, 'Unknown waitlist status');
  const [rows] = await pool.execute(
    `SELECT w.id, r.house_id, h.owner_user_id FROM waitlist w JOIN rooms r ON r.id = w.room_id
     JOIN houses h ON h.id = r.house_id WHERE w.id = ?`, [id]);
  const entry = rows[0];
  if (!entry) throw httpError(404, 'Waitlist entry not found');
  if (user.role === 'staff' && !user.houseIds.includes(entry.house_id)) throw httpError(404, 'Waitlist entry not found');
  if (user.role === 'landlord' && entry.owner_user_id && entry.owner_user_id !== user.id) throw httpError(404, 'Waitlist entry not found');
  await pool.execute('UPDATE waitlist SET status = ? WHERE id = ?', [status, id]);
  const [updated] = await pool.execute('SELECT * FROM waitlist WHERE id = ?', [id]);
  return updated[0];
};
