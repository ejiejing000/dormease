const mysql = require('mysql2/promise');
const { db } = require('./env');
const pool = mysql.createPool({ ...db, waitForConnections:true, connectionLimit:10, decimalNumbers:true });
async function transaction(work) {
  const conn = await pool.getConnection();
  try { await conn.beginTransaction(); const result = await work(conn); await conn.commit(); return result; }
  catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
module.exports = { pool, transaction };
