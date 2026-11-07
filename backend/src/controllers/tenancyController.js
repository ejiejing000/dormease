const { route, badIf, guard } = require('../utils/http');
const { httpError, id: isId, date: isDate } = require('../utils/validate');
const tenancyModel = require('../models/tenancyModel');
const audit = require('../utils/audit');

exports.list = route(async (body, req) => {
  guard(badIf(req.query.status && !['active', 'ended'].includes(req.query.status), 400, 'status must be active or ended'));
  return tenancyModel.listForUser(req.user, req.query);
});

exports.register = route(async (body, req) => tenancyModel.register(req.user, req.query));

exports.get = route(async (body, req) => {
  const tenancy = await tenancyModel.byIdForUser(req.params.id, req.user);
  if (!tenancy) throw httpError(404, 'Lease not found');
  return { ...tenancy, roommates: await tenancyModel.roommates(tenancy.id) };
});

exports.create = route(async (body, req) => {
  guard(badIf(!isId(body.tenant_id), 400, 'tenant_id is required'),
    badIf(!isId(body.room_id), 400, 'room_id is required'),
    badIf(!isDate(body.start_date), 400, 'start_date must be YYYY-MM-DD'));
  const tenancy = await tenancyModel.create({
    tenant_id: Number(body.tenant_id),
    room_id: Number(body.room_id),
    start_date: body.start_date,
    occupants: body.occupants || 1
  }, req.user);
  await audit.log(req, 'tenancy.create', 'tenancies', tenancy.id,
    { tenant_id: tenancy.tenant_id, room_id: tenancy.room_id, occupants: tenancy.occupants });
  return tenancy;
}, 201);

exports.end = route(async (body, req) => {
  const tenancy = await tenancyModel.patch(req.params.id, { status: 'ended', end_date: body.end_date || null }, req.user);
  await audit.log(req, 'tenancy.end', 'tenancies', Number(req.params.id), { end_date: tenancy?.end_date });
  return tenancy;
});

exports.update = route(async (body, req) => {
  guard(badIf(body.end_date !== undefined && body.end_date && !isDate(body.end_date), 400, 'end_date must be YYYY-MM-DD'));
  const tenancy = await tenancyModel.patch(req.params.id, body, req.user);
  await audit.log(req, 'tenancy.update', 'tenancies', Number(req.params.id), body);
  return tenancy;
});
