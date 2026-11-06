const dotenv = require('dotenv');
dotenv.config();

const required = [];
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  required.push('JWT_SECRET (at least 32 characters — replace the .env.example value)');
}
if (!process.env.DB_USER) required.push('DB_USER');
if (!process.env.DB_NAME && !process.env.DB_DATABASE) required.push('DB_NAME');
if (process.env.NODE_ENV === 'production' && required.length) {
  console.error('Missing or invalid environment variables:\n - ' + required.join('\n - '));
  console.error('Copy backend/.env.example to backend/.env and fill it in before starting.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.warn('[DormEase] JWT_SECRET is not set — development fallback token secret is in use. Never deploy this.');
}

module.exports = {
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 9000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dormease'
  },
  jwtSecret: process.env.JWT_SECRET || 'dormease-insecure-development-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  holdMinutes: Number(process.env.HOLD_MINUTES || 30),
  lateFeeAmount: Number(process.env.LATE_FEE_AMOUNT || 100),
  ticketSlaHours: Number(process.env.TICKET_SLA_HOURS || 48),
  invitationHours: Number(process.env.INVITATION_HOURS || 72),
  appUrl: process.env.PUBLIC_APP_URL || 'http://localhost:9000',
  email: {
    host: process.env.EMAIL_HOST || '',
    port: Number(process.env.EMAIL_PORT || 587),
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'no-reply@dormease.local'
  }
};
