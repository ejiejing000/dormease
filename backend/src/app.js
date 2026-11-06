const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { port } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const { notFound } = require('./middleware/errorHandler');
const jobs = require('./jobs');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
// Scoped to /api on purpose: mounted app-wide this also counts the site's own CSS and JS, and once
// the window fills, express.static's successors hand the browser a 429 HTML body where a script was
// expected. Strict MIME checking then refuses it and the page renders with no behaviour at all.
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => res.json({ success: true, service: 'DormEase API' }));

// Explicit registry: the deployed path is the documented path, and no route file is
// mounted by accident just because it exists. A route module that has not been merged
// yet is skipped with a warning, so `main` stays runnable while six branches land.
const routeRegistry = [
  ['/auth', './routes/auth'],
  ['/public', './routes/publicRooms'],
  ['/public', './routes/publicRequests'],
  ['/houses', './routes/houses'],
  ['/rooms', './routes/rooms'],
  ['/reservation-requests', './routes/reservationRequests'],
  ['/reservations', './routes/reservations'],
  ['/waitlist', './routes/waitlist'],
  ['/tenants', './routes/tenants'],
  ['/tenancies', './routes/tenancies'],
  ['/rates', './routes/rates'],
  ['/readings', './routes/readings'],
  ['/bills', './routes/bills'],
  ['/bill-preview', './routes/billPreview'],
  ['/payments', './routes/payments'],
  ['/tickets', './routes/tickets'],
  ['/notifications', './routes/notifications'],
  ['/reports', './routes/reports'],
  ['/invitations', './routes/invitations'],
  ['/staff', './routes/staff'],
  ['/settings', './routes/settings'],
  ['/audit-logs', './routes/auditLogs']
];
for (const [mount, modulePath] of routeRegistry) {
  try {
    app.use('/api' + mount, require(modulePath));
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes(modulePath)) {
      console.warn(`[DormEase] ${modulePath} is not merged yet; /api${mount} is not mounted`);
    } else {
      throw err;
    }
  }
}

// The same server hosts the public site and the dashboards, so `npm start` is enough to run DORMEASE.
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  jobs.start();
  app.listen(port, () => console.log(`DormEase API listening on http://localhost:${port} (public site at /)`));
}

module.exports = app;
