const { route, badIf, guard } = require('../utils/http');
const { httpError, money, id: isId } = require('../utils/validate');
const paymentModel = require('../models/paymentModel');
const audit = require('../utils/audit');

const METHODS = ['cash', 'bank_transfer', 'e_wallet', 'other'];

exports.list = route(async (body, req) => paymentModel.listForUser(req.user, req.query));

exports.get = route(async (body, req) => {
  const payment = await paymentModel.byIdForUser(req.params.id, req.user);
  if (!payment) throw httpError(404, 'Payment not found');
  return payment;
});

exports.receipt = route(async (body, req) => paymentModel.receipt(req.params.id, req.user));

exports.record = route(async (body, req) => {
  guard(badIf(!isId(body.bill_id), 400, 'bill_id is required'),
    badIf(!money(body.amount) || Number(body.amount) <= 0, 400, 'amount must be greater than zero'),
    badIf(body.method && !METHODS.includes(body.method), 400, `method must be one of ${METHODS.join(', ')}`));
  const payment = await paymentModel.record({
    bill_id: Number(body.bill_id),
    amount: Number(body.amount),
    method: body.method || 'cash',
    reference_no: body.reference_no ?? null,
    paid_at: body.paid_at ?? null
  }, req.user);
  await audit.log(req, 'payment.record', 'payments', payment.id,
    { bill_id: payment.bill_id, amount: Number(payment.amount), bill_status: payment.bill_status });
  return payment;
}, 201);
