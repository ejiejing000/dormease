const { pool } = require('../config/db');
const { limit } = require('./query');

exports.listForUser = async (user, filters = {}) => {
  const [rows] = await pool.execute(
    `SELECT id, title, message, channel, is_read, created_at FROM notifications
     WHERE user_id = ? ORDER BY is_read, created_at DESC LIMIT ${limit(filters.limit)}`,
    [user.id]);
  return rows;
};

exports.unreadCount = async (userId) => {
  const [rows] = await pool.execute('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = FALSE', [userId]);
  return Number(rows[0].n);
};

exports.create = async ({ user_id, title, message, channel }) => {
  const [result] = await pool.execute(
    'INSERT INTO notifications (user_id, title, message, channel) VALUES (?,?,?,?)',
    [user_id, title, message, channel || 'in_app']);
  const [rows] = await pool.execute('SELECT * FROM notifications WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.markRead = async (userId, id) => {
  const [result] = await pool.execute('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [id, userId]);
  return result.affectedRows ? { id: Number(id), is_read: true } : null;
};

exports.markAllRead = async (userId) => {
  const [result] = await pool.execute('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE', [userId]);
  return { marked: result.affectedRows };
};

exports.remove = async (userId, id) => {
  const [result] = await pool.execute('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, userId]);
  return result.affectedRows > 0;
};

exports.removeAllRead = async (userId) => {
  const [result] = await pool.execute('DELETE FROM notifications WHERE user_id = ? AND is_read = TRUE', [userId]);
  return { deleted: result.affectedRows };
};
