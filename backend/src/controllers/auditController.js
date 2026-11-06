const { route, badIf, guard } = require('../utils/http');
const auditModel = require('../models/auditModel');

// Audit history is landlord-only and read-only: it is written by the API itself, never by a client POST.
exports.list = route(async (body, req) => {
  guard(badIf(req.user.role !== 'landlord', 403, 'Only landlords can view audit logs'));
  return auditModel.list(req.user, req.query);
});
