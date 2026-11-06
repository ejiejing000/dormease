const { isProduction } = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ success: false, message: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const clientErrorCodes = {
    ER_DUP_ENTRY: 409,
    ER_ROW_IS_REFERENCED_2: 409,
    ER_NO_REFERENCED_ROW_2: 400
  };
  const status = err.status || clientErrorCodes[err.code] || 500;
  if (status >= 500) console.error(err);
  const message = (err.expose || !isProduction) ? (err.message || 'Request failed') : 'Internal server error';
  res.status(status).json({ success: false, message: status >= 500 && isProduction ? 'Internal server error' : message });
}

module.exports = errorHandler;
module.exports.notFound = notFound;
