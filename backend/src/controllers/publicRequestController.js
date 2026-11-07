const { route, badIf, guard } = require('../utils/http');
const { httpError, email: isEmail, phone: isPhone, date: isDate, id: isId } = require('../utils/validate');
const roomModel = require('../models/publicRoomModel');
const requestModel = require('../models/reservationRequestModel');
const audit = require('../utils/audit');
const { pool } = require('../config/db');

// A visitor submits the anonymous ask. It creates no tenant, lease or bill.
exports.submitRequest = route(async (body, req) => {
  guard(
    badIf(!body.full_name || String(body.full_name).trim().length < 2, 400, 'full_name is required'),
    badIf(!isEmail(body.email), 400, 'A valid email is required'),
    badIf(!isPhone(body.phone), 400, 'A valid contact number is required'),
    badIf(!isId(body.room_id), 400, 'room_id is required'),
    badIf(!isDate(body.preferred_move_in_date), 400, 'preferred_move_in_date must be YYYY-MM-DD')
  );
  const room = await roomModel.findPublic(body.room_id);
  if (!room) throw httpError(404, 'That room is not open for requests');
  if (room.availableBeds <= 0) throw httpError(409, 'That room has no free beds right now');
  const created = await requestModel.create({
    room_id: Number(body.room_id),
    full_name: String(body.full_name).trim().slice(0, 150),
    email: String(body.email).trim().toLowerCase(),
    phone: String(body.phone).trim().slice(0, 40),
    preferred_move_in_date: body.preferred_move_in_date,
    message: body.message ? String(body.message).slice(0, 2000) : null
  });
  await audit.systemLog('reservation_request.submitted', 'reservation_request', created.id,
    { email: created.email, room_id: created.room_id, ip: req.ip });
  const staff = await pool.execute(
    `SELECT sa.user_id FROM staff_assignments sa WHERE sa.house_id = ?`, [room.house.id]).catch(() => [[]]);
  for (const row of staff[0]) {
    await pool.execute('INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)',
      [row.user_id, 'New reservation request', `${created.full_name} requested room ${created.room_number}.`]);
  }
  return { id: created.id, status: created.status, message: 'Request received. The landlord or staff will review it.' };
}, 201);

exports.requestStatus = route(async (body, req) => {
  guard(badIf(!isId(req.query.id), 400, 'Request id is required'), badIf(!isEmail(req.query.email), 400, 'A valid email is required'));
  const found = await requestModel.statusForGuest({ id: req.query.id, email: String(req.query.email).trim().toLowerCase() });
  if (!found) throw httpError(404, 'No request matches that id and email');
  return found;
});
