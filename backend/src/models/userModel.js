const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const SAFE_COLUMNS = 'id, full_name, email, role, is_active, created_at';

exports.findByEmail = async (email, { withHash = false } = {}) => {
  const [rows] = await pool.execute(
    `SELECT ${withHash ? 'id, full_name, email, password_hash, role, is_active' : SAFE_COLUMNS} FROM users WHERE email = ?`,
    [String(email || '').trim().toLowerCase()]);
  return rows[0] || null;
};

exports.findById = async (id) => {
  const [rows] = await pool.execute(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows[0] || null;
};

// Accounts only ever appear through provisioning: a landlord row from the system owner,
// staff rows from a landlord, tenant rows from the invitation flow. No public sign-up writes here.
exports.create = async ({ full_name, email, password, role }, db = pool) => {
  const hash = await bcrypt.hash(String(password), 12);
  const [result] = await db.execute(
    'INSERT INTO users (full_name, email, password_hash, role) VALUES (?,?,?,?)',
    [full_name, String(email).trim().toLowerCase(), hash, role]);
  const [rows] = await db.execute(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`, [result.insertId]);
  return rows[0];
};

exports.setPassword = async (db, userId, password) => {
  const hash = await bcrypt.hash(String(password), 12);
  await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
};
