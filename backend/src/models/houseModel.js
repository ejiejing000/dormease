const { pool } = require('../config/db');
const { where, inList, limit } = require('./query');

exports.listForUser = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`h.id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else {
    return [];
  }
  if (filters.q) {
    conditions.push('(h.name LIKE ? OR h.address LIKE ?)');
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  const [rows] = await pool.query(
    `SELECT h.*, u.full_name AS owner_name,
            (SELECT COUNT(*) FROM rooms r WHERE r.house_id = h.id) AS room_count,
            (SELECT COUNT(*) FROM tenancies t JOIN rooms r ON r.id = t.room_id
              WHERE r.house_id = h.id AND t.status = 'active') AS active_tenancies
     FROM houses h LEFT JOIN users u ON u.id = h.owner_user_id${where(conditions)}
     ORDER BY h.name LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

exports.byId = async (id) => {
  const [rows] = await pool.execute(
    'SELECT h.*, u.full_name AS owner_name FROM houses h LEFT JOIN users u ON u.id = h.owner_user_id WHERE h.id = ?', [id]);
  return rows[0] || null;
};

exports.create = async (data) => {
  const [result] = await pool.execute(
    'INSERT INTO houses (name, address, description, owner_user_id) VALUES (?,?,?,?)',
    [data.name, data.address, data.description ?? null, data.owner_user_id ?? null]);
  return exports.byId(result.insertId);
};

exports.patch = async (id, data) => {
  const columns = [], params = [];
  if (data.name) { columns.push('name = ?'); params.push(data.name); }
  if (data.address) { columns.push('address = ?'); params.push(data.address); }
  if (data.description !== undefined) { columns.push('description = ?'); params.push(data.description); }
  if (data.is_active !== undefined) { columns.push('is_active = ?'); params.push(Boolean(data.is_active)); }
  if (columns.length) await pool.execute(`UPDATE houses SET ${columns.join(', ')} WHERE id = ?`, [...params, id]);
  return exports.byId(id);
};

// Audited soft delete: the house and its history stay, but the public site can no longer
// see it or any room inside it. A hard delete would orphan tenancy and billing history.
exports.deactivate = async (id) => {
  await pool.execute('UPDATE houses SET is_active = FALSE WHERE id = ?', [id]);
  return exports.byId(id);
};

exports.houseId = async (id) => id;
