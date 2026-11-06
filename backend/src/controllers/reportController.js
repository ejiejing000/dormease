const { route, badIf, guard } = require('../utils/http');
const { id: isId } = require('../utils/validate');
const reportModel = require('../models/reportModel');

exports.summary = route(async (body, req) => reportModel.summary(req.user));

exports.occupancy = route(async (body, req) => reportModel.occupancy(req.user));

exports.collections = route(async (body, req) => reportModel.collections(req.user));

exports.income = route(async (body, req) => reportModel.monthlyIncome(req.user, req.query.months || 12));

exports.tenantStatement = route(async (body, req) => {
  guard(badIf(!isId(req.params.tenantId), 400, 'Tenant id is not valid'));
  return reportModel.tenantStatement(Number(req.params.tenantId), req.user);
});

exports.list = route(async (body, req) => ({
  summary: await reportModel.summary(req.user),
  occupancy: await reportModel.occupancy(req.user),
  collections: await reportModel.collections(req.user)
}));
