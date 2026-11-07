const { route, badIf, guard } = require('../utils/http');
const { id: isId } = require('../utils/validate');
const waitlistModel = require('../models/waitlistModel');
const audit = require('../utils/audit');

exports.list = route(async (body, req) => waitlistModel.listForUser(req.user, req.query));

exports.create = route(async (body, req) => {
  guard(badIf(!isId(body.tenant_id), 400, 'tenant_id is required'), badIf(!isId(body.room_id), 400, 'room_id is required'));
  const entry = await waitlistModel.create({ tenant_id: Number(body.tenant_id), room_id: Number(body.room_id) });
  await audit.log(req, entry.existing ? 'waitlist.duplicate' : 'waitlist.create', 'waitlist', entry.id);
  return entry;
}, 201);

exports.setStatus = route(async (body, req) => {
  const entry = await waitlistModel.setStatus(req.params.id, body.status, req.user);
  await audit.log(req, `waitlist.${body.status}`, 'waitlist', Number(req.params.id));
  return entry;
});
