const { pool } = require('../config/db');
const { where, inList, limit } = require('./query');
const { httpError } = require('../utils/validate');
const { canAccessHouse } = require('../utils/scope');
const billModel = require('./billModel');

const SELECT = `SELECT p.*, b.billing_month, b.total_amount, b.status AS bill_status, r.house_id,
    tn.tenant_id, te.full_name AS tenant_name, r.room_number, h.name AS house_name, u.full_name AS received_by_name
  FROM payments p
  JOIN bills b ON b.id = p.bill_id
  JOIN tenancies tn ON tn.id = b.tenancy_id
  JOIN tenants te ON te.id = tn.tenant_id
  JOIN rooms r ON r.id = tn.room_id
  JOIN houses h ON h.id = r.house_id
  LEFT JOIN users u ON u.id = p.received_by`;

exports.listForUser = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`r.house_id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else if (user.role === 'tenant') {
    if (!user.tenantId) return [];
    conditions.push('tn.tenant_id = ?');
    params.push(user.tenantId);
  }
  if (filters.billId) { conditions.push('p.bill_id = ?'); params.push(Number(filters.billId)); }
  const [rows] = await pool.query(`${SELECT}${where(conditions)}
    ORDER BY p.paid_at DESC, p.id DESC LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

exports.byIdForUser = async (id, user) => {
  const [rows] = await pool.execute(`${SELECT} WHERE p.id = ?`, [id]);
  const payment = rows[0];
  if (!payment) return null;
  if (user.role === 'tenant' && payment.tenant_id !== user.tenantId) return null;
  if (user.role === 'staff' && !user.houseIds.includes(payment.house_id)) return null;
  if (user.role === 'landlord' && !(await canAccessHouse(user, payment.house_id))) return null;
  return payment;
};

exports.record = async ({ bill_id, amount, method, reference_no, paid_at }, user) => {
  const [bills] = await pool.execute(
    `SELECT b.*, tn.tenant_id, te.user_id AS tenant_user_id, r.house_id
     FROM bills b JOIN tenancies tn ON tn.id = b.tenancy_id
     JOIN tenants te ON te.id = tn.tenant_id JOIN rooms r ON r.id = tn.room_id WHERE b.id = ?`, [bill_id]);
  const bill = bills[0];
  if (!bill) throw httpError(404, 'Bill not found');
  if (!await canAccessHouse(user, bill.house_id)) throw httpError(404, 'Bill not found');
  if (bill.status === 'void') throw httpError(409, 'This bill was voided');
  if (bill.status === 'paid') throw httpError(409, 'This bill is already fully paid');
  const [paid] = await pool.execute('SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE bill_id = ?', [bill_id]);
  const outstanding = Number((Number(bill.total_amount) - Number(paid[0].total)).toFixed(2));
  if (Number(amount) > outstanding) throw httpError(400, `Payment exceeds the outstanding balance of ${outstanding}`);
  const [result] = await pool.execute(
    `INSERT INTO payments (bill_id, amount, method, reference_no, received_by, paid_at)
     VALUES (?,?,?,?,?,COALESCE(?, NOW()))`,
    [bill_id, Number(amount), method || 'cash', reference_no ?? null, user.id, paid_at ?? null]);
  const status = await billModel.setStatusFromPayments(pool, bill_id);
  if (bill.tenant_user_id) {
    await pool.execute('INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)',
      [bill.tenant_user_id, status.status === 'paid' ? 'Payment received - bill settled' : 'Payment recorded',
        `${Number(amount)} applied to your bill for ${bill.billing_month}. Remaining ${Number((outstanding - Number(amount)).toFixed(2))}.`]);
  }
  await pool.execute('INSERT INTO email_outbox(recipient,subject,body) SELECT email, ?, ? FROM users WHERE id = ?',
    [status.status === 'paid' ? 'Receipt for your DormEase bill' : 'Payment recorded',
      `Payment of ${Number(amount)} received on your bill for ${bill.billing_month}.`, bill.tenant_user_id]);
  return exports.byIdForUser(result.insertId, user);
};

exports.receipt = async (id, user) => {
  const payment = await exports.byIdForUser(id, user);
  if (!payment) throw httpError(404, 'Payment not found');
  const [bills] = await pool.execute(
    `SELECT b.*, tn.tenant_id FROM bills b JOIN tenancies tn ON tn.id = b.tenancy_id WHERE b.id = ?`, [payment.bill_id]);
  const bill = bills[0];
  if (user.role === 'tenant' && bill.tenant_id !== user.tenantId) throw httpError(404, 'Payment not found');
  const [items] = await pool.execute('SELECT description, quantity, unit_price, amount FROM bill_items WHERE bill_id = ? ORDER BY id', [bill.id]);
  const [all] = await pool.execute('SELECT amount, method, reference_no, paid_at FROM payments WHERE bill_id = ? ORDER BY paid_at, id', [bill.id]);
  return {
    receipt: { id: payment.id, amount: Number(payment.amount), method: payment.method, reference: payment.reference_no, paidAt: payment.paid_at },
    bill: { id: bill.id, month: bill.billing_month, total: Number(bill.total_amount), status: bill.status, dueDate: bill.due_date },
    room: payment.room_number,
    house: payment.house_name,
    tenant: payment.tenant_name,
    items,
    payments: all.map(p => ({ amount: Number(p.amount), method: p.method, paidAt: p.paid_at }))
  };
};
