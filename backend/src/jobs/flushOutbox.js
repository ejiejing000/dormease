const { pool } = require('../config/db');
const notify = require('../utils/notify');

module.exports = async function flushOutbox() {
  const result = await notify.deliverQueued(pool, 25);
  if (result.queued) console.log(`[DormEase] outbox: ${result.sent}/${result.queued} emails sent`);
  else if (result.waiting) console.log(`[DormEase] outbox: ${result.waiting} emails waiting (EMAIL_HOST not configured)`);
};
