const { pool } = require('../config/db');
const { where, inList, limit } = require('./query');
const { httpError } = require('../utils/validate');
const { canAccessHouse } = require('../utils/scope');
const notify = require('../utils/notify');
const tenancyModel = require('./tenancyModel');

const SELECT = `SELECT mt.*, tn.tenant_id, te.user_id AS tenant_user_id, te.full_name AS tenant_name,
    r.room_number, r.house_id, h.name AS house_name, cu.full_name AS created_by_name
  FROM maintenance_tickets mt
  JOIN tenancies tn ON tn.id = mt.tenancy_id
  JOIN tenants te ON te.id = tn.tenant_id
  JOIN rooms r ON r.id = tn.room_id
  JOIN houses h ON h.id = r.house_id
  LEFT JOIN users cu ON cu.id = mt.created_by`;

exports.listForUser = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`r.house_id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else if (user.role === 'tenant') {
    if (!user.tenantId) return [];
    conditions.push('tn.tenant_id = ?');
    params.push(user.tenantId);
  }
  if (filters.status) { conditions.push('mt.status = ?'); params.push(filters.status); }
  if (filters.open) conditions.push("mt.status IN ('open','in_progress','escalated')");
  const [rows] = await pool.query(`${SELECT}${where(conditions)}
    ORDER BY FIELD(mt.status,'escalated','open','in_progress','resolved','closed'), mt.created_at DESC
    LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

exports.byIdForUser = async (id, user) => {
  const [rows] = await pool.execute(`${SELECT} WHERE mt.id = ?`, [id]);
  const ticket = rows[0];
  if (!ticket) return null;
  if (user.role === 'tenant' && ticket.tenant_id !== user.tenantId) return null;
  if (user.role === 'staff' && !user.houseIds.includes(ticket.house_id)) return null;
  if (user.role === 'landlord' && !(await canAccessHouse(user, ticket.house_id))) return null;
  const [history] = await pool.execute(
    `SELECT h.id, h.status, h.note, h.created_at, u.full_name AS changed_by_name
     FROM ticket_status_history h LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.ticket_id = ? ORDER BY h.id`, [id]);
  return { ...ticket, history };
};

exports.create = async ({ tenancy_id, title, description, priority }, user) => {
  // A tenant reporting a problem for the room they live in does not have to know the lease id.
  const leaseId = tenancy_id || (user.role === 'tenant' ? (await tenancyModel.activeForTenant(user.tenantId))[0]?.id : null);
  if (!leaseId) throw httpError(400, 'tenancy_id is required');
  const [tenancies] = await pool.execute(
    `SELECT tn.id, tn.tenant_id, tn.status, r.house_id FROM tenancies tn JOIN rooms r ON r.id = tn.room_id WHERE tn.id = ?`,
    [leaseId]);
  const tenancy = tenancies[0];
  if (!tenancy) throw httpError(404, 'Tenancy not found');
  if (user.role === 'tenant') {
    if (tenancy.tenant_id !== user.tenantId) throw httpError(404, 'Tenancy not found');
  } else if (!await canAccessHouse(user, tenancy.house_id)) throw httpError(404, 'Tenancy not found');
  if (tenancy.status !== 'active') throw httpError(409, 'Tickets need an active tenancy');
  const [result] = await pool.execute(
    `INSERT INTO maintenance_tickets (tenancy_id, title, description, priority, status, created_by)
     VALUES (?,?,?,?,'open',?)`, [leaseId, title, description, priority || 'normal', user.id]);
  const [staff] = await pool.execute(
    `SELECT sa.user_id FROM staff_assignments sa WHERE sa.house_id = ? LIMIT 10`, [tenancy.house_id]);
  for (const row of staff) {
    await notify.notifyUser(pool, { userId: row.user_id, title: 'New maintenance ticket', message: `${title} (${priority || 'normal'})` });
  }
  return exports.byIdForUser(result.insertId, user);
};

const STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'escalated'];

exports.setStatus = async (id, status, user, note = null) => {
  if (!STATUSES.includes(status)) throw httpError(400, `Status must be one of ${STATUSES.join(', ')}`);
  const ticket = await exports.byIdForUser(id, user);
  if (!ticket) throw httpError(404, 'Ticket not found');
  await pool.execute('UPDATE maintenance_tickets SET status = ? WHERE id = ?', [status, id]);
  await pool.execute('INSERT INTO ticket_status_history(ticket_id,status,changed_by,note) VALUES(?,?,?,?)',
    [id, status, user.id, note]);
  if (ticket.tenant_user_id) {
    await notify.notifyUser(pool, {
      userId: ticket.tenant_user_id,
      title: `Ticket ${status}`,
      message: `Your maintenance request "${ticket.title}" is now ${status}.${note ? ' Note: ' + note : ''}`
    });
  }
  return exports.byIdForUser(id, user);
};

exports.patch = async (id, data, user) => {
  const ticket = await exports.byIdForUser(id, user);
  if (!ticket) throw httpError(404, 'Ticket not found');
  const columns = [], params = [];
  if (data.title !== undefined) { columns.push('title = ?'); params.push(String(data.title).slice(0, 150)); }
  if (data.description !== undefined) { columns.push('description = ?'); params.push(String(data.description).slice(0, 4000)); }
  if (data.priority !== undefined) { columns.push('priority = ?'); params.push(data.priority); }
  if (columns.length) await pool.execute(
    `UPDATE maintenance_tickets SET ${columns.join(', ')} WHERE id = ?`, [...params, id]);
  return exports.byIdForUser(id, user);
};

exports.remove = async (id, user) => {
  const ticket = await exports.byIdForUser(id, user);
  if (!ticket) throw httpError(404, 'Ticket not found');
  await pool.execute('DELETE FROM maintenance_tickets WHERE id = ?', [id]);
};

// Ticket history report: LEFT JOIN keeps tickets that never changed status.
exports.historyReport = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`h.id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else if (user.role === 'tenant') {
    if (!user.tenantId) return [];
    conditions.push('tn.tenant_id = ?');
    params.push(user.tenantId);
  } else {
    return [];
  }
  if (filters.status) { conditions.push('mt.status = ?'); params.push(filters.status); }
  const [rows] = await pool.query(
    `SELECT mt.id AS ticket_id, mt.title, mt.priority, mt.status,
            te.full_name AS tenant_name, r.room_number, h.name AS house_name,
            sh.id AS history_id, sh.status AS history_status, sh.note, sh.created_at AS changed_at,
            cu.full_name AS changed_by_name
     FROM maintenance_tickets mt
     INNER JOIN tenancies tn ON tn.id = mt.tenancy_id
     INNER JOIN tenants te ON te.id = tn.tenant_id
     INNER JOIN rooms r ON r.id = tn.room_id
     INNER JOIN houses h ON h.id = r.house_id
     LEFT JOIN ticket_status_history sh ON sh.ticket_id = mt.id
     LEFT JOIN users cu ON cu.id = sh.changed_by
     ${where(conditions)}
     ORDER BY mt.id DESC, sh.id
     LIMIT ${limit(filters.limit, 500)}`, params);
  return rows;
};
