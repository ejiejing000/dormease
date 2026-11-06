const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { jwtSecret } = require('../config/env');

module.exports = async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    let payload;
    try {
      payload = jwt.verify(header.slice(7).trim(), jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    const [users] = await pool.execute(
      'SELECT id, full_name, email, role, is_active FROM users WHERE id = ?', [payload.id]);
    const user = users[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Account unavailable' });
    }
    const [scope] = await pool.execute(
      `SELECT sa.house_id, sa.can_manage_rates FROM staff_assignments sa
       JOIN houses h ON h.id = sa.house_id AND h.is_active = TRUE
       WHERE sa.user_id = ?`, [user.id]);
    const [tenantRows] = await pool.execute(
      'SELECT id FROM tenants WHERE user_id = ? ORDER BY id DESC LIMIT 1', [user.id]);
    req.user = {
      ...user,
      assignments: scope,
      houseIds: scope.map(s => s.house_id),
      tenantId: user.role === 'tenant' ? (tenantRows[0]?.id ?? null) : null
    };
    next();
  } catch (e) { next(e); }
};
