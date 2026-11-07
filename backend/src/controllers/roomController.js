const { route, badIf, guard } = require('../utils/http');
const { httpError, money, id: isId } = require('../utils/validate');
const { canAccessHouse } = require('../utils/scope');
const roomModel = require('../models/roomModel');
const audit = require('../utils/audit');

const COOLING = ['fan', 'aircon', 'none'];

exports.list = route(async (body, req) => roomModel.listForUser(req.user, req.query));

exports.vacancyReport = route(async (body, req) => roomModel.vacancyReport(req.user));

exports.get = route(async (body, req) => {
  const room = await roomModel.findForUser(req.params.id, req.user);
  if (!room) throw httpError(404, 'Room not found');
  return room;
});

exports.create = route(async (body, req) => {
  guard(
    badIf(!isId(body.house_id), 400, 'house_id is required'),
    badIf(!body.room_number, 400, 'room_number is required'),
    badIf(!money(body.monthly_rent), 400, 'monthly_rent must be a positive number'),
    badIf(!Number.isInteger(Number(body.bed_capacity)) || Number(body.bed_capacity) < 1, 400, 'bed_capacity must be at least 1'),
    badIf(body.cooling_type && !COOLING.includes(body.cooling_type), 400, `cooling_type must be one of ${COOLING.join(', ')}`)
  );
  if (!await canAccessHouse(req.user, Number(body.house_id))) throw httpError(404, 'House not found');
  const room = await roomModel.create({
    house_id: Number(body.house_id),
    room_number: String(body.room_number).slice(0, 30),
    monthly_rent: Number(body.monthly_rent),
    bed_capacity: Number(body.bed_capacity),
    cooling_type: body.cooling_type || 'fan',
    storage_available: body.storage_available ?? false,
    amenities: Array.isArray(body.amenities) ? body.amenities : (body.amenities ? String(body.amenities).split(',') : undefined),
    photo_url: body.photo_url ?? null,
    is_listed: body.is_listed ?? true
  });
  await audit.log(req, 'room.create', 'rooms', room.id, { house_id: room.house_id, room_number: room.room_number });
  return room;
}, 201);

exports.update = route(async (body, req) => {
  const existing = await roomModel.findForUser(req.params.id, req.user);
  if (!existing) throw httpError(404, 'Room not found');
  guard(badIf(body.monthly_rent !== undefined && !money(body.monthly_rent), 400, 'monthly_rent must be a positive number'),
    badIf(body.cooling_type && !COOLING.includes(body.cooling_type), 400, 'cooling_type is not valid'));
  delete body.house_id;
  const room = await roomModel.patch(req.params.id, {
    ...body,
    amenities: Array.isArray(body.amenities) ? body.amenities : body.amenities
  });
  await audit.log(req, 'room.update', 'rooms', existing.id, body);
  return room;
});

// Deactivating hides the room from public browsing without deleting history.
exports.setListed = route(async (body, req) => {
  const existing = await roomModel.findForUser(req.params.id, req.user);
  if (!existing) throw httpError(404, 'Room not found');
  const listed = body.is_listed === undefined ? true : Boolean(body.is_listed);
  const room = await roomModel.patch(req.params.id, { is_listed: listed });
  await audit.log(req, listed ? 'room.relist' : 'room.deactivate', 'rooms', existing.id);
  return { id: room.id, room_number: room.room_number, is_listed: Boolean(room.is_listed) };
});

exports.remove = route(async (body, req) => {
  const existing = await roomModel.findForUser(req.params.id, req.user);
  if (!existing) throw httpError(404, 'Room not found');
  const deps = await roomModel.dependencies(existing.id);
  const blockers = ['tenancies', 'reservations', 'requests', 'waitlist']
    .filter(key => Number(deps[key]) > 0)
    .map(key => `${key}: ${deps[key]}`);
  if (blockers.length) {
    throw httpError(409, `Room still has history (${blockers.join(', ')}); unlist it instead`);
  }
  await roomModel.remove(existing.id);
  await audit.log(req, 'room.delete', 'rooms', existing.id, { house_id: existing.house_id, room_number: existing.room_number });
});
