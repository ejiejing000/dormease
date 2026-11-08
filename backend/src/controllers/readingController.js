const { route, badIf, guard } = require('../utils/http');
const { id: isId, date: isDate, money } = require('../utils/validate');
const readingModel = require('../models/readingModel');
const audit = require('../utils/audit');

exports.list = route(async (body, req) => readingModel.listForUser(req.user, req.query));

exports.create = route(async (body, req) => {
  guard(badIf(!isId(body.tenancy_id), 400, 'tenancy_id is required'),
    badIf(!body.utility_code && !body.utility_type_id, 400, 'utility_code is required'),
    badIf(!isDate(body.reading_period), 400, 'reading_period must be YYYY-MM-DD (use the first of the month)'),
    badIf(!money(body.current_reading), 400, 'current_reading must be a number'));
  const reading = await readingModel.create({
    tenancy_id: Number(body.tenancy_id),
    utility_code: body.utility_code,
    utility_type_id: body.utility_type_id,
    reading_period: body.reading_period,
    previous_reading: body.previous_reading,
    current_reading: body.current_reading
  }, req.user);
  await audit.log(req, 'reading.create', 'meter_readings', reading.id,
    { tenancy_id: reading.tenancy_id, utility: reading.utility_code, units: Number(reading.units_used) });
  return reading;
}, 201);
