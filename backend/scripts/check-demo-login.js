// Reports which seeded accounts cannot log in, and fixes the ones that only have the
// placeholder hash from the pre-fix seed file.
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DEMO = 'DormEase#2026';

async function main() {
  const database = process.argv[3] || process.env.DB_NAME || 'dormease';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database
  });
  const [users] = await connection.query('SELECT id, email, role, is_active, password_hash FROM users ORDER BY id');
  for (const user of users) {
    const works = bcrypt.compareSync(DEMO, user.password_hash);
    console.log(`${user.email} (${user.role}) active=${user.is_active} demo-password=${works ? 'yes' : 'NO'}`);
    if (!works && process.argv[2] === '--fix') {
      const hash = await bcrypt.hash(DEMO, 12);
      await connection.execute('UPDATE users SET password_hash = ?, is_active = TRUE WHERE id = ?', [hash, user.id]);
      console.log(`  -> password reset to the demo password`);
    }
  }
  await connection.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
