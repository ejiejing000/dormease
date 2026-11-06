const cron = require('node-cron');
const env = require('../config/env');

const schedule = (expression, task, name) => {
  if (!cron.validate(expression)) {
    console.error(`[DormEase] ignoring invalid cron expression for ${name}: ${expression}`);
    return;
  }
  cron.schedule(expression, () => task().catch(e => console.error(`[DormEase] ${name} failed:`, e.message)));
};

// Feature jobs arrive with their owner's slice. Missing modules are skipped so the shared
// baseline still boots while the six branches merge in order.
const optional = (name) => {
  try {
    return require(name);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && String(error.message).includes(name)) {
      console.warn(`[DormEase] job not merged yet: ${name}`);
      return null;
    }
    throw error;
  }
};

exports.start = () => {
  const jobs = [
    [process.env.HOLD_EXPIRY_CRON || '*/5 * * * *', './expireHolds', 'hold expiry'],
    [process.env.OVERDUE_BILLS_CRON || '0 1 * * *', './overdueBills', 'overdue bills'],
    [process.env.TICKET_ESCALATION_CRON || '*/15 * * * *', './escalateTickets', 'ticket escalation'],
    [process.env.EMAIL_OUTBOX_CRON || '*/10 * * * *', './flushOutbox', 'email outbox']
  ];
  for (const [expression, moduleName, name] of jobs) {
    const task = optional(moduleName);
    if (task) schedule(expression, task, name);
  }
  console.log(`[DormEase] scheduled jobs: holds(5m), overdue(${env.lateFeeAmount} fee), escalation(${env.ticketSlaHours}h), outbox`);
};
