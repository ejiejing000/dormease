const { pool } = require('../config/db');
const { where, inList, limit } = require('./query');
const { holdMinutes } = require('../config/env');
const { httpError } = require('../utils/validate');
const { canAccessHouse } = require('../utils/scope');

const SELECT = `SELECT rs.*, te.full_name AS tenant_name, te.email AS tenant_email, r.room_number,
    r.house_id, r.monthly_rent, h.name AS house_name
  FROM reservations rs
  JOIN tenants te ON te.id = rs.tenant_id
  JOIN rooms r ON r.id = rs.room_id
  JOIN houses h ON h.id = r.house_id`;

async function freeBeds(db, roomId) {
  const [rows] = await db.execute(
    `SELECT r.bed_capacity -
      (SELECT COUNT(*) FROM tenancies t WHERE t.room_id = r.id AND t.status='active'
         AND (t.end_date IS NULL OR t.end_date >= CURDATE()))
      - (SELECT COUNT(*) FROM reservations rs WHERE rs.room_id = r.id AND rs.status='held'
         AND rs.hold_expires_at > NOW()) AS free
     FROM rooms r WHERE r.id = ?`, [roomId]);
  if (!rows.length) throw httpError(404, 'Room not found');
  return Number(rows[0].free);
}

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
    conditions.push('rs.tenant_id = ?');
    params.push(user.tenantId);
  }
  if (filters.status) { conditions.push('rs.status = ?'); params.push(filters.status); }
  if (filters.roomId) { conditions.push('rs.room_id = ?'); params.push(Number(filters.roomId)); }
  const [rows] = await pool.query(`${SELECT}${where(conditions)} ORDER BY rs.id DESC LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

exports.byIdForUser = async (id, user) => {
  const rows = await exports.listForUser(user, {});
  return rows.find(r => String(r.id) === String(id)) || null;
};

exports.create = async ({ tenant_id, room_id, start_date, hold = false }, user) => {
  const beds = await freeBeds(pool, room_id);
  if (beds <= 0) throw httpError(409, 'Room has no free beds for the requested date');
  const [result] = await pool.execute(
    `INSERT INTO reservations (tenant_id, room_id, start_date, status, source, hold_expires_at)
     VALUES (?,?,?,?,'staff_created', IF(? = TRUE, DATE_ADD(NOW(), INTERVAL ? MINUTE), NULL))`,
    [tenant_id, room_id, start_date, hold ? 'held' : 'pending', hold ? 1 : 0, holdMinutes]);
  await pool.execute('INSERT INTO reservation_events(reservation_id,event_type,note) VALUES(?,?,?)',
    [result.insertId, hold ? 'held' : 'created', `Created by user ${user.id}`]);
  const [rows] = await pool.execute(`${SELECT} WHERE rs.id = ?`, [result.insertId]);
  return rows[0];
};

const NEXT = { approve: 'approved', reject: 'rejected', cancel: 'cancelled', hold: 'held' };

exports.setStatus = async (id, action, user, note = null) => {
  const status = NEXT[action];
  if (!status) throw httpError(400, `Unknown reservation action ${action}`);
  const [rows] = await pool.execute(
    `SELECT rs.*, r.house_id FROM reservations rs JOIN rooms r ON r.id = rs.room_id WHERE rs.id = ? FOR UPDATE`, [id]);
  const reservation = rows[0];
  if (!reservation) throw httpError(404, 'Reservation not found');
  if (user.role === 'tenant' && reservation.tenant_id !== user.tenantId) throw httpError(404, 'Reservation not found');
  // Reads are scoped inside listForUser, but this write path only tested staff, so one landlord
  // could approve, hold or cancel a reservation sitting in another landlord's house.
  if (user.role !== 'tenant' && !await canAccessHouse(user, reservation.house_id)) throw httpError(404, 'Reservation not found');
  if (status === 'approved') {
    const beds = await freeBeds(pool, reservation.room_id);
    if (beds <= 0) throw httpError(409, 'Room has no free beds right now');
  }
  // A hold always gets a fresh expiry, exactly like creating one with hold=true: expireHolds only
  // releases rows whose expiry is set, and freeBeds only counts a held bed while it is still valid.
  // A terminal status clears the expiry so the row cannot be mistaken for an active hold.
  await pool.execute(
    `UPDATE reservations SET status = ?,
       hold_expires_at = IF(? = 1, DATE_ADD(NOW(), INTERVAL ? MINUTE), NULL) WHERE id = ?`,
    [status, status === 'held' ? 1 : 0, holdMinutes, id]);
  await pool.execute('INSERT INTO reservation_events(reservation_id,event_type,note) VALUES(?,?,?)',
    [id, status, note]);
  const [updated] = await pool.execute(`${SELECT} WHERE rs.id = ?`, [id]);
  return updated[0];
};

exports.events = async (id) => {
  const [rows] = await pool.execute(
    'SELECT id, event_type, note, created_at FROM reservation_events WHERE reservation_id = ? ORDER BY id', [id]);
  return rows;
};
