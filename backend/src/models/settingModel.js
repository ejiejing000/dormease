const { pool } = require('../config/db');

exports.list = async () => {
  const [rows] = await pool.execute('SELECT setting_key, setting_value, updated_at FROM system_settings ORDER BY setting_key');
  return rows;
};

exports.upsert = async (key, value) => {
  await pool.execute(
    `INSERT INTO system_settings (setting_key, setting_value) VALUES (?,?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`, [key, String(value)]);
  const [rows] = await pool.execute(
    'SELECT setting_key, setting_value, updated_at FROM system_settings WHERE setting_key = ?', [key]);
  return rows[0];
};

exports.remove = async (key) => {
  const [result] = await pool.execute('DELETE FROM system_settings WHERE setting_key = ?', [key]);
  return result.affectedRows > 0;
};
