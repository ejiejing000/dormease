const { pool } = require('../config/db');

const run = (sql, params) => pool.execute(sql, params).catch(e => console.error('[DormEase] audit write failed:', e.message));

exports.log = (req, action, entityType, entityId = null, details = {}) =>
  run('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)',
    [req.user?.id ?? null, action, entityType, entityId, JSON.stringify(details)]);

exports.systemLog = (action, entityType, entityId = null, details = {}) =>
  run('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(NULL,?,?,?,?)',
    [action, entityType, entityId, JSON.stringify(details)]);
