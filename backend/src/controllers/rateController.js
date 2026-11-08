const { route, badIf, guard } = require('../utils/http');
const { httpError, money, id: isId, date: isDate } = require('../utils/validate');
const { canManageRates, canAccessHouse } = require('../utils/scope');
const rateModel = require('../models/rateModel');
const audit = require('../utils/audit');

exports.list = route(async (body, req) => rateModel.listForUser(req.user, req.query));

exports.types = route(async (body, req) => {
  if (!['landlord', 'staff'].includes(req.user.role)) throw httpError(403, 'Forbidden');
  return rateModel.utilityTypes();
});

exports.get = route(async (body, req) => {
  const rate = await rateModel.byId(req.params.id);
  if (!rate || !await canAccessHouse(req.user, rate.house_id)) throw httpError(404, 'Rate not found');
  return { ...rate, tiers: await rateModel.tiers(rate.id) };
});

// Staff rate rights are per assignment (staff_assignments.can_manage_rates); landlords always can.
exports.create = route(async (body, req) => {
  guard(badIf(!isId(body.house_id), 400, 'house_id is required'),
    badIf(!body.utility_code && !body.utility_type_id, 400, 'utility_code is required'),
    badIf(body.fixed_charge !== undefined && !money(body.fixed_charge), 400, 'fixed_charge must be a positive number'),
    badIf(!isDate(body.effective_from), 400, 'effective_from must be YYYY-MM-DD'));
  if (!await canManageRates(req.user, Number(body.house_id))) throw httpError(403, 'Rate changes are not part of your assignment');
  if (body.tiers) guard(badIf(!Array.isArray(body.tiers), 400, 'tiers must be an array'));
  const rate = await rateModel.create({
    house_id: Number(body.house_id),
    utility_code: body.utility_code,
    utility_type_id: body.utility_type_id,
    fixed_charge: body.fixed_charge ?? 0,
    effective_from: body.effective_from,
    tiers: body.tiers || []
  });
  await audit.log(req, 'rate.create', 'utility_rates', rate.id, { house_id: rate.house_id, tiers: (body.tiers || []).length });
  return { ...rate, tiers: await rateModel.tiers(rate.id) };
}, 201);

exports.addTier = route(async (body, req) => {
  const rate = await rateModel.byId(req.params.id);
  if (!rate) throw httpError(404, 'Rate not found');
  if (!await canManageRates(req.user, rate.house_id)) throw httpError(403, 'Rate changes are not part of your assignment');
  guard(badIf(!money(body.lower_units), 400, 'lower_units is required'),
    badIf(!money(body.price_per_unit), 400, 'price_per_unit is required'));
  const tiers = await rateModel.addTier(rate.id, body);
  await audit.log(req, 'rate.tier_add', 'utility_rates', rate.id, body);
  return tiers;
}, 201);
