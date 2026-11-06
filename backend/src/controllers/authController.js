const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const { route, badIf, guard } = require('../utils/http');
const { httpError, email: isEmail } = require('../utils/validate');
const userModel = require('../models/userModel');
const audit = require('../utils/audit');

const DASHBOARD = { landlord: 'dashboard.html', staff: 'dashboard.html', tenant: 'tenant-dashboard.html' };

const sign = user => jwt.sign({ id: user.id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn, algorithm: 'HS256' });

// The role always comes from the users row; nothing in the request can choose it.
exports.login = route(async (body, req) => {
  guard(badIf(!isEmail(body.email), 400, 'A valid email is required'), badIf(!body.password, 400, 'Password is required'));
  const user = await userModel.findByEmail(body.email, { withHash: true });
  if (!user || !user.is_active || !(await bcrypt.compare(String(body.password), user.password_hash))) {
    throw httpError(401, 'Invalid email or password');
  }
  const [scope] = await pool.execute('SELECT house_id, can_manage_rates FROM staff_assignments WHERE user_id = ?', [user.id]);
  const [tenantRows] = await pool.execute('SELECT id FROM tenants WHERE user_id = ? LIMIT 1', [user.id]);
  delete user.password_hash;
  await audit.systemLog('auth.login', 'user', user.id, { role: user.role });
  return {
    token: sign(user),
    user: {
      ...user,
      tenantId: user.role === 'tenant' ? (tenantRows[0]?.id ?? null) : null,
      houseIds: scope.map(s => s.house_id),
      dashboard: DASHBOARD[user.role] || 'login.html'
    }
  };
});

exports.me = route(async (body, req) => {
  const [tenantRows] = await pool.execute(
    `SELECT te.id, te.full_name, te.email, te.phone FROM tenants te WHERE te.user_id = ? LIMIT 1`, [req.user.id]);
  return { ...req.user, tenant: tenantRows[0] || null };
});

exports.changePassword = route(async (body, req) => {
  guard(badIf(!body.current_password, 400, 'current_password is required'),
    badIf(!body.new_password || String(body.new_password).length < 10, 400, 'new_password must be at least 10 characters'));
  const user = await userModel.findByEmail(req.user.email, { withHash: true });
  if (!(await bcrypt.compare(String(body.current_password), user.password_hash))) {
    throw httpError(401, 'Current password is incorrect');
  }
  await userModel.setPassword(pool, req.user.id, body.new_password);
  await audit.log(req, 'auth.password_changed', 'user', req.user.id);
  return { password_changed: true };
});

// Invitation acceptance lives in invitationController/routes/invitations so the
// tenant-onboarding feature has a single owner.
exports.logout = route(async (body, req) => {
  await audit.log(req, 'auth.logout', 'user', req.user.id);
  return { logged_out: true };
});
