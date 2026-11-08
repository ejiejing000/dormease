const { pool } = require('../config/db');
const { lateFeeAmount } = require('../config/env');
const audit = require('../utils/audit');

module.exports = async function overdueBills() {
  const fee = Number(lateFeeAmount || 0);
  const [due] = await pool.execute(
    `SELECT b.id, b.tenancy_id, b.total_amount FROM bills b
     WHERE b.status IN ('unpaid','partial') AND b.due_date < CURDATE() AND b.late_fee_applied_at IS NULL`);
  for (const bill of due) {
    await pool.execute(
      `UPDATE bills SET late_fee = late_fee + ?, total_amount = total_amount + ?, status = 'overdue', late_fee_applied_at = NOW()
       WHERE id = ? AND late_fee_applied_at IS NULL`, [fee, fee, bill.id]);
    await pool.execute(
      `INSERT INTO notifications(user_id,title,message)
       SELECT te.user_id, 'Bill is overdue', CONCAT('Bill #', ?, ' is overdue. A late fee of ', ?, ' was added.')
       FROM tenancies tn JOIN tenants te ON te.id = tn.tenant_id WHERE tn.id = ? AND te.user_id IS NOT NULL`,
      [bill.id, fee, bill.tenancy_id]);
  }
  if (due.length) await audit.systemLog('bill.overdue_sweep', 'bills', null, { bills: due.length, fee });
  return { processed: due.length };
};
