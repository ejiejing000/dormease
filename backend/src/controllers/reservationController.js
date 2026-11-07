const { route, badIf, guard } = require('../utils/http');
const { httpError, id: isId, date: isDate } = require('../utils/validate');
const reservationModel = require('../models/reservationModel');
const audit = require('../utils/audit');

const ACTIONS = { approve: 'approved', reject: 'rejected', cancel: 'cancelled', hold: 'held' };

exports.list = route(async (body, req) => reservationModel.listForUser(req.user, req.query));

exports.get = route(async (body, req) => {
  const found = await reservationModel.byIdForUser(req.params.id, req.user);
  if (!found) throw httpError(404, 'Reservation not found');
  return { ...found, events: await reservationModel.events(req.params.id) };
});

exports.create = route(async (body, req) => {
  guard(badIf(!isId(body.tenant_id), 400, 'tenant_id is required'),
    badIf(!isId(body.room_id), 400, 'room_id is required'),
    badIf(!isDate(body.start_date), 400, 'start_date must be YYYY-MM-DD'));
  const created = await reservationModel.create({
    tenant_id: Number(body.tenant_id), room_id: Number(body.room_id), start_date: body.start_date, hold: Boolean(body.hold)
  }, req.user);
  await audit.log(req, created.status === 'held' ? 'reservation.hold' : 'reservation.create', 'reservations', created.id,
    { tenant_id: created.tenant_id, room_id: created.room_id });
  return created;
}, 201);

exports.setStatus = route(async (body, req) => {
  const action = req.params.action;
  guard(badIf(!ACTIONS[action], 400, `action must be one of ${Object.keys(ACTIONS).join(', ')}`));
  const updated = await reservationModel.setStatus(req.params.id, action, req.user, body.note ?? null);
  await audit.log(req, `reservation.${action}`, 'reservations', Number(req.params.id), { note: body.note ?? null });
  return updated;
});
