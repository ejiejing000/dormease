const { pool } = require('../config/db');
const { where, limit } = require('./query');

exports.list = async (user, filters = {}) => {
  if (user.role !== 'landlord') return [];
  const conditions = [], params = [];
  if (filters.entityType) { conditions.push('a.entity_type = ?'); params.push(filters.entityType); }
  if (filters.action) { conditions.push('a.action LIKE ?'); params.push(`%${filters.action}%`); }
  if (filters.actorId) { conditions.push('a.actor_user_id = ?'); params.push(Number(filters.actorId)); }
  const [rows] = await pool.query(
    `SELECT a.*, u.full_name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id${where(conditions)}
     ORDER BY a.created_at DESC, a.id DESC LIMIT ${limit(filters.limit)}`, params);
  return rows;
};
