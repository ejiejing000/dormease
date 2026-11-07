const { pool } = require('../config/db');
const { where, inList, limit } = require('./query');

exports.listForUser = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`(NOT EXISTS (SELECT 1 FROM tenancies t WHERE t.tenant_id = te.id)
       OR EXISTS (SELECT 1 FROM tenancies t JOIN rooms r ON r.id = t.room_id
                   WHERE t.tenant_id = te.id AND r.house_id IN (${inList(user.houseIds)})))`);
    params.push(...user.houseIds);
  } else if (user.role !== 'landlord') {
    return [];
  }
  if (filters.q) {
    conditions.push('(te.full_name LIKE ? OR te.email LIKE ? OR te.phone LIKE ?)');
    const like = `%${filters.q}%`;
    params.push(like, like, like);
  }
  if (filters.hasAccount === 'yes') conditions.push('te.user_id IS NOT NULL');
  if (filters.hasAccount === 'no') conditions.push('te.user_id IS NULL');
  const [rows] = await pool.query(
    `SELECT te.*, u.role AS account_role, u.is_active AS account_active,
            (SELECT COUNT(*) FROM tenancies t WHERE t.tenant_id = te.id AND t.status = 'active') AS active_tenancies
     FROM tenants te LEFT JOIN users u ON u.id = te.user_id${where(conditions)}
     ORDER BY te.id DESC LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

exports.byId = async (id) => {
  const [rows] = await pool.execute('SELECT * FROM tenants WHERE id = ?', [id]);
  return rows[0] || null;
};

// Landlords see every tenant record. Staff only see tenants who live in one of their
// houses or whom they invited themselves, so PII cannot be read across house scopes.
exports.findForUser = async (id, user) => {
  if (user.role === 'landlord') return exports.byId(id);
  if (user.role !== 'staff' || !user.houseIds.length) return null;
  const [rows] = await pool.execute(
    `SELECT te.* FROM tenants te
     WHERE te.id = ? AND (
       EXISTS (SELECT 1 FROM tenancies tn JOIN rooms r ON r.id = tn.room_id
               WHERE tn.tenant_id = te.id AND r.house_id IN (${inList(user.houseIds)}))
       OR EXISTS (SELECT 1 FROM account_invitations ai
                  WHERE ai.tenant_id = te.id AND ai.created_by = ?))
     LIMIT 1`,
    [id, ...user.houseIds, user.id]);
  return rows[0] || null;
};

exports.create = async (data, db = pool) => {
  const [result] = await db.execute(
    'INSERT INTO tenants (user_id, full_name, email, phone) VALUES (?,?,?,?)',
    [data.user_id ?? null, data.full_name, data.email ?? null, data.phone ?? null]);
  return { id: result.insertId, ...data };
};

exports.patch = async (id, data) => {
  const columns = [], params = [];
  for (const field of ['full_name', 'email', 'phone']) {
    if (data[field] !== undefined) { columns.push(`${field} = ?`); params.push(data[field]); }
  }
  if (data.user_id !== undefined) { columns.push('user_id = ?'); params.push(data.user_id); }
  if (columns.length) await pool.execute(`UPDATE tenants SET ${columns.join(', ')} WHERE id = ?`, [...params, id]);
  return exports.byId(id);
};

exports.linkUser = async (db, tenantId, userId) => {
  await db.execute('UPDATE tenants SET user_id = ? WHERE id = ?', [userId, tenantId]);
};

// Tenant history must survive: a tenant that has leases, reservations or waitlist rows is kept
// and the delete is refused. Only a record with no dependencies is removed.
exports.dependencies = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM tenancies WHERE tenant_id = ?) AS tenancies,
       (SELECT COUNT(*) FROM reservations WHERE tenant_id = ?) AS reservations,
       (SELECT COUNT(*) FROM waitlist WHERE tenant_id = ?) AS waitlist,
       (SELECT COUNT(*) FROM tenants WHERE id = ? AND user_id IS NOT NULL) AS account`,
    [id, id, id, id]);
  return rows[0];
};

exports.remove = async (id) => {
  await pool.execute('DELETE FROM tenants WHERE id = ?', [id]);
};
