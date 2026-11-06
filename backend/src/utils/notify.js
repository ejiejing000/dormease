const nodemailer = require('nodemailer');
const { email } = require('../config/env');

let transport = null;
function mailer() {
  if (!email.host) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: email.host, port: email.port, secure: email.port === 465,
      auth: email.user ? { user: email.user, pass: email.password } : undefined
    });
  }
  return transport;
}

// Emails are queued inside the caller's transaction and delivered by the outbox job,
// so a slow or missing SMTP server never blocks or rolls back business operations.
exports.queue = async (db, { recipient, subject, body }) => {
  await db.execute('INSERT INTO email_outbox(recipient,subject,body) VALUES(?,?,?)', [recipient, subject, body]);
};

exports.deliverQueued = async (db, limit = 25) => {
  const smtp = mailer();
  if (!smtp) {
    // README and .env.example both promise that leaving EMAIL_HOST empty keeps mail in
    // email_outbox, so the backlog is reported and left alone rather than marked failed.
    const [[{ pending }]] = await db.execute("SELECT COUNT(*) AS pending FROM email_outbox WHERE status = 'queued'");
    return { queued: 0, sent: 0, waiting: Number(pending) };
  }
  const [rows] = await db.execute(
    "SELECT id, recipient, subject, body FROM email_outbox WHERE status='queued' ORDER BY id LIMIT " + Number(limit), []);
  let sent = 0;
  for (const row of rows) {
    try {
      await smtp.sendMail({ from: email.from, to: row.recipient, subject: row.subject, text: row.body });
      await db.execute("UPDATE email_outbox SET status='sent' WHERE id=?", [row.id]);
      sent++;
    } catch (e) {
      await db.execute("UPDATE email_outbox SET status='failed' WHERE id=?", [row.id]);
      console.error('[DormEase] email delivery failed:', e.message);
    }
  }
  return { queued: rows.length, sent, waiting: 0 };
};

exports.notifyUser = async (db, { userId, title, message, recipient, subject, body }) => {
  if (userId) {
    await db.execute('INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)', [userId, title, message]);
  }
  if (recipient) await exports.queue(db, { recipient, subject: subject || title, body: body || message });
};
