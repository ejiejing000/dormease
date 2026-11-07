const { pool, transaction } = require('../config/db');
const { where, inList, limit } = require('./query');
const { appUrl } = require('../config/env');
const invitationModel = require('./invitationModel');
const notify = require('../utils/notify');
const { httpError } = require('../utils/validate');

const COLUMNS = `rq.id, rq.full_name, rq.email, rq.phone, rq.preferred_move_in_date, rq.message,
  rq.status, rq.reviewed_at, rq.review_note, rq.created_reservation_id, rq.created_at,
  rq.room_id, r.room_number, r.monthly_rent, r.bed_capacity, r.cooling_type,
  r.house_id, h.name AS house_name, rq.reviewed_by, ru.full_name AS reviewed_by_name`;

const FROM = `FROM reservation_requests rq
  JOIN rooms r ON r.id = rq.room_id
  JOIN houses h ON h.id = r.house_id
  LEFT JOIN users ru ON ru.id = rq.reviewed_by`;

async function occupiedNow(db, roomId) {
  const [rows] = await db.execute(
    `SELECT (SELECT COUNT(*) FROM tenancies t WHERE t.room_id = ? AND t.status = 'active'
              AND (t.end_date IS NULL OR t.end_date >= CURDATE()))
            + (SELECT COUNT(*) FROM reservations rs WHERE rs.room_id = ? AND rs.status = 'held'
              AND rs.hold_expires_at > NOW()) AS used`, [roomId, roomId]);
  return Number(rows[0].used);
}

exports.create = async (data) => {
  const [free] = await pool.execute('SELECT COUNT(*) AS n FROM reservation_requests WHERE email = ? AND status = ?', [data.email, 'pending']);
  if (Number(free[0].n) >= 5) throw httpError(429, 'Too many open requests for this email address');
  const [result] = await pool.execute(
    `INSERT INTO reservation_requests (room_id, full_name, email, phone, preferred_move_in_date, message)
     VALUES (?,?,?,?,?,?)`,
    [data.room_id, data.full_name, data.email, data.phone, data.preferred_move_in_date, data.message ?? null]);
  const [rows] = await pool.execute(`SELECT ${COLUMNS} ${FROM} WHERE rq.id = ?`, [result.insertId]);
  return rows[0];
};

exports.listForUser = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`r.house_id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else {
    return [];
  }
  if (filters.status) { conditions.push('rq.status = ?'); params.push(filters.status); }
  const [rows] = await pool.query(`SELECT ${COLUMNS} ${FROM}${where(conditions)}
    ORDER BY (rq.status = 'pending') DESC, rq.created_at DESC LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

exports.findForUser = async (id, user) => {
  const rows = await exports.listForUser(user, {});
  return rows.find(r => String(r.id) === String(id)) || null;
};

// Public status check for the applicant: token-free but limited to what they already know.
exports.statusForGuest = async ({ email, id }) => {
  const [rows] = await pool.execute(
    `SELECT rq.id, rq.status, rq.created_at, rq.reviewed_at, rq.review_note, r.room_number, h.name AS house_name
     FROM reservation_requests rq JOIN rooms r ON r.id = rq.room_id JOIN houses h ON h.id = r.house_id
     WHERE rq.id = ? AND rq.email = ?`, [id, email]);
  return rows[0] || null;
};

// Approving creates the official tenant, the approved reservation and (optionally) the lease,
// then provisions access with an expiring single-use invitation instead of a default password.
exports.approve = async (id, actor, { startTenancy = false, moveInDate = null, occupants = 1, note = null, sendInvite = true } = {}) =>
  transaction(async (db) => {
    const [requests] = await db.execute(
      `SELECT rq.*, r.house_id FROM reservation_requests rq JOIN rooms r ON r.id = rq.room_id
       WHERE rq.id = ? FOR UPDATE`, [id]);
    const request = requests[0];
    if (!request) throw httpError(404, 'Reservation request not found');
    if (request.status !== 'pending') throw httpError(409, `Request is already ${request.status}`);

    const [rooms] = await db.execute('SELECT id, bed_capacity, monthly_rent, room_number FROM rooms WHERE id = ? FOR UPDATE', [request.room_id]);
    const room = rooms[0];
    if (!room) throw httpError(404, 'Room not found');
    const freeBeds = Number(room.bed_capacity) - await occupiedNow(db, room.id);
    if (freeBeds <= 0) throw httpError(409, 'Room has no free beds right now');

    const startDate = moveInDate || request.preferred_move_in_date;

    const [existing] = await db.execute('SELECT id, user_id FROM tenants WHERE email = ? ORDER BY id LIMIT 1', [request.email]);
    let tenant = existing[0] || null;
    if (!tenant) {
      const [created] = await db.execute(
        'INSERT INTO tenants (full_name, email, phone) VALUES (?,?,?)',
        [request.full_name, request.email, request.phone]);
      tenant = { id: created.insertId, user_id: null };
    }

    const [reservation] = await db.execute(
      `INSERT INTO reservations (tenant_id, room_id, start_date, status, source) VALUES (?,?,?,'approved','guest_request')`,
      [tenant.id, request.room_id, startDate]);
    await db.execute(`INSERT INTO reservation_events(reservation_id,event_type,note) VALUES(?,?,?)`,
      [reservation.insertId, 'approved', `From reservation request #${request.id}`]);

    let tenancyId = null;
    if (startTenancy) {
      const people = Math.max(1, Math.min(Number(occupants) || 1, freeBeds));
      const [created] = await db.execute(
        `INSERT INTO tenancies (tenant_id, room_id, start_date, status, occupants) VALUES (?,?,?,'active',?)`,
        [tenant.id, request.room_id, startDate, people]);
      tenancyId = created.insertId;
      await db.execute(`UPDATE reservations SET status='approved' WHERE id=?`, [reservation.insertId]);
    }

    await db.execute(
      `UPDATE reservation_requests SET status='approved', reviewed_by=?, reviewed_at=NOW(), review_note=?, created_reservation_id=?
       WHERE id=?`, [actor.id, note, reservation.insertId, id]);

    let invite = null;
    if (sendInvite && !tenant.user_id) {
      invite = await invitationModel.create(db, { tenantId: tenant.id, email: request.email, actorUserId: actor.id });
      await notify.queue(db, {
        recipient: request.email,
        subject: 'Your DORMEASE tenant account',
        body: `Hello ${request.full_name},\n\nYour reservation request for room ${room.room_number} starting ${startDate} was approved.\n\nCreate your password here (this link works once and expires with the invitation): ${appUrl}/pages/set-password.html?token=${invite.token}\n\n`
      });
    } else if (tenant.user_id) {
      await db.execute(
        `INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)`,
        [tenant.user_id, 'Reservation approved',
          `Your request for room ${room.room_number} starting ${startDate} was approved.`]);
    }

    return { requestId: Number(id), status: 'approved', tenantId: tenant.id, reservationId: reservation.insertId, tenancyId, invited: Boolean(invite), invitationToken: invite?.token ?? null };
  });

exports.reject = async (id, actor, { note = null } = {}) => transaction(async (db) => {
  const [requests] = await db.execute('SELECT * FROM reservation_requests WHERE id = ? FOR UPDATE', [id]);
  const request = requests[0];
  if (!request) throw httpError(404, 'Reservation request not found');
  if (request.status !== 'pending') throw httpError(409, `Request is already ${request.status}`);
  await db.execute(
    `UPDATE reservation_requests SET status='rejected', reviewed_by=?, reviewed_at=NOW(), review_note=? WHERE id=?`,
    [actor.id, note, id]);
  return { requestId: Number(id), status: 'rejected' };
});
