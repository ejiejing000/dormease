const { route, badIf, guard } = require('../utils/http');
const { httpError, id: isId } = require('../utils/validate');
const billCalcModel = require('../models/billCalcModel');
const tenancyModel = require('../models/tenancyModel');

// Preview never writes: it runs the same Smart Utility Billing Engine used by bill generation.
exports.preview = route(async (body, req) => {
  guard(badIf(!isId(body.tenancy_id ?? body.tenancyId), 400, 'tenancy_id is required'),
    badIf(!body.billing_month && !body.billingMonth, 400, 'billing_month is required (YYYY-MM)'));
  const tenancyId = Number(body.tenancy_id ?? body.tenancyId);
  const tenancy = await tenancyModel.byIdForUser(tenancyId, req.user);
  if (!tenancy) throw httpError(404, 'Tenancy not found');
  return billCalcModel.preview({
    tenancyId,
    billingMonth: (body.billing_month || body.billingMonth),
    waterUnits: body.water_units ?? body.waterUnits,
    electricityUnits: body.electricity_units ?? body.electricityUnits,
    daysInPeriod: body.days_in_period ?? body.daysInPeriod,
    occupiedDays: body.occupied_days ?? body.occupiedDays,
    roommates: body.roommates
  });
});
