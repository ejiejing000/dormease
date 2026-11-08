const { route, badIf, guard } = require('../utils/http');
const { httpError, id: isId, money, date: isDate } = require('../utils/validate');
const billModel = require('../models/billModel');
const audit = require('../utils/audit');

const mapInput = (body) => {
  guard(badIf(!isId(body.tenancy_id ?? body.tenancyId), 400, 'tenancy_id is required'),
    badIf(!body.billing_month && !body.billingMonth, 400, 'billing_month is required (YYYY-MM)'));
  return {
    tenancyId: Number(body.tenancy_id ?? body.tenancyId),
    billingMonth: (body.billing_month || body.billingMonth),
    dueDate: body.due_date || body.dueDate || null,
    dueDayOfMonth: body.due_day_of_month ?? body.dueDayOfMonth ?? 10,
    waterUnits: body.water_units ?? body.waterUnits,
    electricityUnits: body.electricity_units ?? body.electricityUnits,
    daysInPeriod: body.days_in_period ?? body.daysInPeriod,
    occupiedDays: body.occupied_days ?? body.occupiedDays,
    roommates: body.roommates
  };
};

exports.list = route(async (body, req) => billModel.listForUser(req.user, req.query));

exports.ledger = route(async (body, req) => billModel.ledger(req.user, req.query));

exports.get = route(async (body, req) => {
  const bill = await billModel.byIdForUser(req.params.id, req.user);
  if (!bill) throw httpError(404, 'Bill not found');
  return bill;
});

exports.generate = route(async (body, req) => {
  const result = await billModel.generate(mapInput(body), req.user);
  await audit.log(req, 'bill.generate', 'bills', result.billId,
    { tenancy_id: result.breakdown?.tenancyId, total: result.total, skipped: Boolean(result.skipped) });
  return result;
}, 201);

exports.generateAll = route(async (body, req) => {
  guard(badIf(!body.billing_month && !body.billingMonth, 400, 'billing_month is required (YYYY-MM)'));
  const result = await billModel.generateAll({
    billingMonth: body.billing_month || body.billingMonth,
    houseId: body.house_id ?? body.houseId,
    dueDayOfMonth: body.due_day_of_month ?? 10,
    dueDate: body.due_date ?? null
  }, req.user);
  await audit.log(req, 'bill.generate_all', 'bills', null, { billing_month: result.billingMonth, processed: result.processed });
  return result;
}, 201);

exports.void = route(async (body, req) => {
  const result = await billModel.void(req.params.id, req.user, body.reason ?? null);
  await audit.log(req, 'bill.void', 'bills', Number(req.params.id), { reason: body.reason ?? null });
  return result;
});

exports.update = route(async (body, req) => {
  guard(
    badIf(body.rent_amount !== undefined && !money(body.rent_amount), 400, 'rent_amount must be a non-negative number'),
    badIf(body.water_amount !== undefined && !money(body.water_amount), 400, 'water_amount must be a non-negative number'),
    badIf(body.electricity_amount !== undefined && !money(body.electricity_amount), 400, 'electricity_amount must be a non-negative number'),
    badIf(body.late_fee !== undefined && !money(body.late_fee), 400, 'late_fee must be a non-negative number'),
    badIf(body.due_date !== undefined && !isDate(body.due_date), 400, 'due_date must be YYYY-MM-DD'));
  const bill = await billModel.patch(req.params.id, body, req.user);
  await audit.log(req, 'bill.update', 'bills', Number(req.params.id), body);
  return bill;
});

exports.remove = route(async (body, req) => {
  await billModel.remove(req.params.id, req.user);
  await audit.log(req, 'bill.delete', 'bills', Number(req.params.id));
});
