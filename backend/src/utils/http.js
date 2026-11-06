const { httpError } = require('./validate');

// Wraps a controller body so thrown errors always reach the error middleware.
exports.route = (handler, status = 200) => async (req, res, next) => {
  try {
    const data = await handler(req.body || {}, req);
    if (!res.headersSent) res.status(data === undefined ? 204 : status).json({ success: true, data });
  } catch (e) { next(e); }
};

exports.guard = (...errors) => {
  const first = errors.find(Boolean);
  if (first) throw httpError(first.status || 400, first.message);
};

exports.badIf = (condition, status, message) => (condition ? { status, message } : null);
