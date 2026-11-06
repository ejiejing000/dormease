const { route, badIf, guard } = require('../utils/http');
const { httpError, email: isEmail } = require('../utils/validate');
const staffModel = require('../models/staffModel');
const audit = require('../utils/audit');

exports.list = route(async (body, req) => staffModel.listForUser(req.user));

exports.get = route(async (body, req) => {
  const staff = await staffModel.byId(Number(req.params.id));
  if (!staff) throw httpError(404, 'Staff account not found');
  return staff;
});

exports.coverage = route(async () => staffModel.coverage());

// Landlords provision staff; there is no public staff sign-up.
exports.create = route(async (body, req) => {
  guard(badIf(!body.full_name, 400, 'full_name is required'),
    badIf(!isEmail(body.email), 400, 'A valid email is required'),
    badIf(body.password && String(body.password).length < 10, 400, 'password must be at least 10 characters'));
  const staff = await staffModel.create({
    full_name: String(body.full_name).slice(0, 150),
    email: body.email,
    password: body.password || null,
    house_ids: Array.isArray(body.house_ids) ? body.house_ids.map(Number) : [],
    can_manage_rates: body.can_manage_rates !== false
  }, req.user);
  await audit.log(req, 'staff.create', 'users', staff.id, { email: staff.email, house_ids: staff.house_ids });
  return staff;
}, 201);

exports.assignHouses = route(async (body, req) => {
  guard(badIf(!Array.isArray(body.house_ids), 400, 'house_ids must be an array'));
  const staff = await staffModel.assignHouses(Number(req.params.id), body.house_ids, body.can_manage_rates !== false);
  if (!staff) throw httpError(404, 'Staff account not found');
  await audit.log(req, 'staff.assign_houses', 'users', staff.id, { house_ids: staff.house_ids });
  return staff;
});

exports.update = route(async (body, req) => {
  guard(badIf(body.email !== undefined && !isEmail(body.email), 400, 'A valid email is required'),
    badIf(body.full_name !== undefined && !body.full_name, 400, 'full_name cannot be empty'));
  const staff = await staffModel.patch(Number(req.params.id), body);
  await audit.log(req, 'staff.update', 'users', staff.id, body);
  return staff;
});

exports.remove = route(async (body, req) => {
  const staff = await staffModel.deactivate(Number(req.params.id));
  await audit.log(req, 'staff.delete', 'users', staff.id);
  return { id: staff.id, is_active: Boolean(staff.is_active), deleted: true };
});

exports.setPassword = route(async (body, req) => {
  guard(badIf(!body.password || String(body.password).length < 10, 400, 'password must be at least 10 characters'));
  const result = await staffModel.setPassword(Number(req.params.id), body.password);
  await audit.log(req, 'staff.password_reset', 'users', Number(req.params.id));
  return result;
});

exports.deactivate = route(async (body, req) => {
  const staff = await staffModel.deactivate(Number(req.params.id));
  await audit.log(req, 'staff.deactivate', 'users', staff.id);
  return staff;
});
