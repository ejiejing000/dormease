const { route, badIf, guard } = require('../utils/http');
const { httpError } = require('../utils/validate');
const settingModel = require('../models/settingModel');
const audit = require('../utils/audit');

exports.list = route(async () => settingModel.list());

exports.update = route(async (body, req) => {
  guard(badIf(!body.value, 400, 'value is required'),
    badIf(!/^[a-z0-9_]{2,60}$/.test(req.params.key), 400, 'key must be lower_snake_case'));
  const setting = await settingModel.upsert(req.params.key, String(body.value).slice(0, 500));
  await audit.log(req, 'setting.update', 'system_settings', null, { key: setting.setting_key });
  return setting;
});

exports.remove = route(async (body, req) => {
  const deleted = await settingModel.remove(req.params.key);
  if (!deleted) throw httpError(404, 'Setting not found');
  await audit.log(req, 'setting.delete', 'system_settings', null, { key: req.params.key });
});
