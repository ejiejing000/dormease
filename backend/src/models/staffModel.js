const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, transaction } = require('../config/db');
const { appUrl } = require('../config/env');
const { httpError } = require('../utils/validate');
const notify = require('../utils/notify');

const SELECT = `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.created_at,
    GROUP_CONCAT(sa.house_id ORDER BY sa.house_id) AS house_ids,
    GROUP_CONCAT(h.name ORDER BY sa.house_id) AS house_names,
    MIN(sa.can_manage_rates) AS can_manage_rates
  FROM users u
  LEFT JOIN staff_assignments sa ON sa.user_id = u.id
  LEFT JOIN houses h ON h.id = sa.house_id
  WHERE u.role = 'staff'`;

exports.listForUser = async (user) => {
  if (user.role !== 'landlord') {
    if (user.role !== 'staff') return [];
    const [self] = await pool.execute(`${SELECT} AND u.id = ? GROUP BY u.id`, [user.id]);
    return self;
  }
  const [rows] = await pool.execute(`${SELECT} GROUP BY u.id ORDER BY u.id DESC LIMIT 200`);
  return rows.map(exports.shape);
};

// Join report: every staff account with its assignment count, even when it has no
// assignment yet, so the LEFT JOIN is visible instead of silently becoming an INNER JOIN.
exports.coverage = async () => {
  const [rows] = await pool.execute(
    `SELECT u.id, u.full_name, u.email, u.is_active,
            COUNT(sa.house_id) AS houses,
            GROUP_CONCAT(h.name ORDER BY h.name SEPARATOR ', ') AS house_names,
            MIN(sa.can_manage_rates) AS can_manage_rates
     FROM users u
     LEFT JOIN staff_assignments sa ON sa.user_id = u.id
     LEFT JOIN houses h ON h.id = sa.house_id
     WHERE u.role = 'staff'
     GROUP BY u.id ORDER BY u.id`);
  return rows.map(exports.shape);
};

exports.shape = (row) => ({
  ...row,
  house_ids: row.house_ids ? String(row.house_ids).split(',').map(Number) : [],
  house_names: row.house_names ? String(row.house_names).split(',') : [],
  can_manage_rates: row.can_manage_rates === null ? null : Boolean(Number(row.can_manage_rates))
});

exports.byId = async (id) => {
  const [rows] = await pool.execute(`${SELECT} AND u.id = ? GROUP BY u.id`, [id]);
  return rows[0] ? exports.shape(rows[0]) : null;
};

// Staff accounts are landlord-provisioned only. When no password is supplied one is generated
// and returned exactly once (and emailed) instead of using a shared default.
exports.create = async ({ full_name, email, password, house_ids = [], can_manage_rates = true }, actor) => {
  const generated = password ? null : generatePassword();
  const secret = password || generated;
  const result = await transaction(async (db) => {
    const hash = await bcrypt.hash(String(secret), 12);
    const [created] = await db.execute(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES (?,?,?,'staff')",
      [full_name, String(email).trim().toLowerCase(), hash]);
    for (const houseId of house_ids) {
      await db.execute(
        `INSERT INTO staff_assignments (user_id, house_id, can_manage_rates) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE can_manage_rates = VALUES(can_manage_rates)`,
        [created.insertId, Number(houseId), Boolean(can_manage_rates)]);
    }
    await notify.queue(db, {
      recipient: email,
      subject: 'Your DORMEASE staff account',
      body: `You have been given a staff account for DORMEASE.\nSign in at ${appUrl}/pages/login.html using ${email}.\n${generated ? `Temporary password: ${generated}\nPlease change it after signing in.` : `Password: the one you were given out-of-band.`}`
    });
    return created.insertId;
  });
  const staff = await exports.byId(result);
  return { ...staff, temporary_password: generated };
};

function generatePassword() {
  return crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + '4a!';
}

exports.assignHouses = async (userId, houseIds, canManageRates) => {
  if (userId) {
    const [users] = await pool.execute('SELECT role FROM users WHERE id = ?', [userId]);
    if (!users[0] || users[0].role !== 'staff') throw httpError(404, 'Staff account not found');
  }
  return transaction(async (db) => {
    await db.execute('DELETE FROM staff_assignments WHERE user_id = ?', [userId]);
    for (const houseId of houseIds) {
      const [houses] = await db.execute('SELECT id FROM houses WHERE id = ?', [Number(houseId)]);
      if (!houses[0]) throw httpError(400, `House ${houseId} does not exist`);
      await db.execute(
        'INSERT INTO staff_assignments (user_id, house_id, can_manage_rates) VALUES (?,?,?)',
        [userId, Number(houseId), Boolean(canManageRates)]);
    }
    return exports.byId(userId);
  });
};

exports.patch = async (userId, data) => {
  const staff = await exports.byId(userId);
  if (!staff) throw httpError(404, 'Staff account not found');
  const columns = [], params = [];
  if (data.full_name !== undefined) { columns.push('full_name = ?'); params.push(String(data.full_name).slice(0, 150)); }
  if (data.email !== undefined) { columns.push('email = ?'); params.push(String(data.email).trim().toLowerCase()); }
  if (data.is_active !== undefined) { columns.push('is_active = ?'); params.push(Boolean(data.is_active)); }
  if (columns.length) {
    await pool.execute(`UPDATE users SET ${columns.join(', ')} WHERE id = ? AND role = 'staff'`, [...params, userId]);
  }
  return exports.byId(userId);
};

exports.deactivate = async (userId) => {
  const staff = await exports.byId(userId);
  if (!staff) throw httpError(404, 'Staff account not found');
  await pool.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [userId]);
  return exports.byId(userId);
};

exports.setPassword = async (userId, password) => {
  const [rows] = await pool.execute('SELECT id FROM users WHERE id = ? AND role = ?', [userId, 'staff']);
  if (!rows[0]) throw httpError(404, 'Staff account not found');
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(String(password), 12), userId]);
  return { id: userId, password_changed: true };
};
