const crypto = require('crypto');
const { pool } = require('../config/db');
const { inList, where, limit } = require('./query');
const { invitationHours } = require('../config/env');

const hash = token => crypto.createHash('sha256').update(token).digest('hex');

// Only the hash is stored, so a database leak cannot be replayed as an invitation link,
// and the plaintext token is returned exactly once.
exports.create = async (db, { tenantId, email, actorUserId }) => {
  const token = crypto.randomBytes(32).toString('hex');
  const [result] = await db.execute(
    `INSERT INTO account_invitations(tenant_id,email,token_hash,expires_at,created_by)
     VALUES(?,?,?,DATE_ADD(NOW(),INTERVAL ? HOUR),?)`,
    [tenantId, email, hash(token), invitationHours, actorUserId ?? null]);
  return { id: result.insertId, token, expiresInHours: invitationHours };
};

exports.findActive = async (db, token) => {
  const [rows] = await db.execute(
    `SELECT i.*, t.full_name, t.user_id, u.email AS account_email
     FROM account_invitations i
     JOIN tenants t ON t.id = i.tenant_id
     LEFT JOIN users u ON u.id = t.user_id
     WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.expires_at > NOW()`,
    [hash(token)]);
  return rows[0] || null;
};

exports.listForTenant = async (tenantId) => {
  const [rows] = await pool.execute(
    `SELECT id, email, expires_at, accepted_at, created_at FROM account_invitations
     WHERE tenant_id = ? ORDER BY id DESC LIMIT 20`, [tenantId]);
  return rows;
};

exports.markAccepted = async (db, invitationId) => {
  await db.execute('UPDATE account_invitations SET accepted_at = NOW() WHERE id = ?', [invitationId]);
};

exports.expire = async (db, invitationId) => {
  await db.execute('UPDATE account_invitations SET expires_at = NOW() WHERE id = ?', [invitationId]);
};

exports.hash = hash;

exports.byId = async (id) => {
  const [rows] = await pool.execute(
    `SELECT i.*, t.full_name, t.user_id FROM account_invitations i
     JOIN tenants t ON t.id = i.tenant_id WHERE i.id = ?`, [id]);
  return rows[0] || null;
};

// Invitation register for the admin screen. Staff see invitations for tenants in their
// houses plus the ones they issued, so a new tenant can be re-invited before moving in.
exports.listForUser = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(
      `(EXISTS (SELECT 1 FROM tenancies tn JOIN rooms r ON r.id = tn.room_id
                WHERE tn.tenant_id = i.tenant_id AND r.house_id IN (${inList(user.houseIds)}))
        OR i.created_by = ?)`);
    params.push(...user.houseIds, user.id);
  } else if (user.role !== 'landlord') {
    return [];
  }
  if (filters.tenantId) { conditions.push('i.tenant_id = ?'); params.push(Number(filters.tenantId)); }
  if (filters.status === 'pending') conditions.push('i.accepted_at IS NULL AND i.expires_at > NOW()');
  if (filters.status === 'accepted') conditions.push('i.accepted_at IS NOT NULL');
  if (filters.status === 'expired') conditions.push('i.accepted_at IS NULL AND i.expires_at <= NOW()');
  const [rows] = await pool.query(
    `SELECT i.id, i.tenant_id, i.email, i.expires_at, i.accepted_at, i.created_at, i.created_by,
            t.full_name, u.full_name AS created_by_name,
            CASE WHEN i.accepted_at IS NOT NULL THEN 'accepted'
                 WHEN i.expires_at <= NOW() THEN 'expired' ELSE 'pending' END AS status
     FROM account_invitations i
     JOIN tenants t ON t.id = i.tenant_id
     LEFT JOIN users u ON u.id = i.created_by
     ${where(conditions)}
     ORDER BY i.id DESC LIMIT ${limit(filters.limit, 200)}`, params);
  return rows;
};

exports.revoke = async (id) => {
  await pool.execute('UPDATE account_invitations SET expires_at = NOW() WHERE id = ? AND accepted_at IS NULL', [id]);
};

exports.remove = async (id) => {
  await pool.execute('DELETE FROM account_invitations WHERE id = ? AND accepted_at IS NULL', [id]);
};

// Onboarding coverage report: LEFT JOIN keeps tenants with zero invitations, which is
// exactly the set an admin needs to see to finish provisioning accounts.
exports.coverage = async (user) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`EXISTS (SELECT 1 FROM tenancies tn JOIN rooms r ON r.id = tn.room_id
      WHERE tn.tenant_id = t.id AND r.house_id IN (${inList(user.houseIds)}))`);
    params.push(...user.houseIds);
  } else if (user.role !== 'landlord') {
    return [];
  }
  const [rows] = await pool.query(
    `SELECT t.id AS tenant_id, t.full_name, t.email,
            u.id AS account_user_id, u.is_active AS account_active,
            COUNT(i.id) AS invitations,
            COALESCE(SUM(i.accepted_at IS NOT NULL), 0) AS accepted,
            MAX(i.created_at) AS last_invitation_at
     FROM tenants t
     LEFT JOIN account_invitations i ON i.tenant_id = t.id
     LEFT JOIN users u ON u.id = t.user_id
     ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
     GROUP BY t.id, t.full_name, t.email, u.id, u.is_active
     ORDER BY invitations, t.full_name LIMIT 500`, params);
  return rows.map(row => ({
    ...row,
    invitations: Number(row.invitations),
    accepted: Number(row.accepted),
    has_account: Boolean(row.account_user_id)
  }));
};
