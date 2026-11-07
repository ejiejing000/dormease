const { route, badIf, guard } = require('../utils/http');
const { httpError, email: isEmail } = require('../utils/validate');
const tenantModel = require('../models/tenantModel');
const tenancyModel = require('../models/tenancyModel');
const audit = require('../utils/audit');

exports.list = route(async (body, req) => tenantModel.listForUser(req.user, req.query));

exports.get = route(async (body, req) => {
  const tenant = await tenantModel.findForUser(req.params.id, req.user);
  if (!tenant) throw httpError(404, 'Tenant not found');
  return { ...tenant, tenancies: await tenancyModel.listForUser(req.user, { tenantId: tenant.id }) };
});

exports.create = route(async (body, req) => {
  guard(badIf(!body.full_name, 400, 'full_name is required'),
    badIf(body.email && !isEmail(body.email), 400, 'email is not valid'));
  const tenant = await tenantModel.create({
    full_name: String(body.full_name).slice(0, 150),
    email: body.email ? String(body.email).trim().toLowerCase() : null,
    phone: body.phone ? String(body.phone).slice(0, 40) : null
  });
  await audit.log(req, 'tenant.create', 'tenants', tenant.id, { email: tenant.email });
  return tenant;
}, 201);

exports.update = route(async (body, req) => {
  const existing = await tenantModel.findForUser(req.params.id, req.user);
  if (!existing) throw httpError(404, 'Tenant not found');
  guard(badIf(body.email && !isEmail(body.email), 400, 'email is not valid'));
  const tenant = await tenantModel.patch(existing.id, body);
  await audit.log(req, 'tenant.update', 'tenants', existing.id, body);
  return tenant;
});

exports.remove = route(async (body, req) => {
  const existing = await tenantModel.findForUser(req.params.id, req.user);
  if (!existing) throw httpError(404, 'Tenant not found');
  const deps = await tenantModel.dependencies(existing.id);
  if (deps.account) throw httpError(409, 'This tenant has a login account; deactivate the user instead');
  const blockers = ['tenancies', 'reservations', 'waitlist']
    .filter(key => Number(deps[key]) > 0)
    .map(key => `${key}: ${deps[key]}`);
  if (blockers.length) {
    throw httpError(409, `Tenant still has history (${blockers.join(', ')}); end or remove it first`);
  }
  await tenantModel.remove(existing.id);
  await audit.log(req, 'tenant.delete', 'tenants', existing.id, { email: existing.email });
});
