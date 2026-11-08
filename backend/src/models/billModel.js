const { pool, transaction } = require('../config/db');
const { where, inList, limit } = require('./query');
const { canAccessHouse } = require('../utils/scope');
const { httpError } = require('../utils/validate');
const billCalcModel = require('./billCalcModel');
const notify = require('../utils/notify');

const SELECT = `SELECT b.*, tn.tenant_id, tn.room_id, te.full_name AS tenant_name, te.user_id AS tenant_user_id,
    r.room_number, r.house_id, h.name AS house_name,
    (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.bill_id = b.id) AS paid_amount
  FROM bills b
  JOIN tenancies tn ON tn.id = b.tenancy_id
  JOIN tenants te ON te.id = tn.tenant_id
  JOIN rooms r ON r.id = tn.room_id
  JOIN houses h ON h.id = r.house_id`;

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
  if (filters.status) { conditions.push('b.status = ?'); params.push(filters.status); }
  if (filters.tenancyId) { conditions.push('b.tenancy_id = ?'); params.push(Number(filters.tenancyId)); }
  if (filters.houseId) { conditions.push('r.house_id = ?'); params.push(Number(filters.houseId)); }
  if (filters.month) { conditions.push('b.billing_month = ?'); params.push(String(filters.month).slice(0, 7) + '-01'); }
  const [rows] = await pool.query(`${SELECT}${where(conditions)}
    ORDER BY b.billing_month DESC, b.id DESC LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

exports.byIdForUser = async (id, user) => {
  const [rows] = await pool.execute(`${SELECT} WHERE b.id = ?`, [id]);
  const bill = rows[0];
  if (!bill) return null;
  if (user.role === 'tenant' && bill.tenant_id !== user.tenantId) return null;
  if (user.role === 'staff' && !user.houseIds.includes(bill.house_id)) return null;
  if (user.role === 'landlord' && !(await canAccessHouse(user, bill.house_id))) return null;
  const [items] = await pool.execute(
    'SELECT id, description, quantity, unit_price, amount FROM bill_items WHERE bill_id = ? ORDER BY id', [id]);
  return { ...bill, items };
};

async function upsert(db, { tenancy, breakdown, dueDate, billingMonth }) {
  const [existing] = await db.execute('SELECT id, status FROM bills WHERE tenancy_id = ? AND billing_month = ?',
    [tenancy.id, billingMonth]);
  const amounts = [breakdown.rent, breakdown.water, breakdown.electricity, breakdown.total, dueDate];
  if (existing[0]) {
    if (existing[0].status === 'paid') return { billId: existing[0].id, skipped: true };
    await db.execute(
      `UPDATE bills SET rent_amount=?, water_amount=?, electricity_amount=?, total_amount=?, due_date=?,
              late_fee=0, late_fee_applied_at=NULL, status='unpaid' WHERE id=?`,
      [...amounts, existing[0].id]);
    await db.execute('DELETE FROM bill_items WHERE bill_id = ?', [existing[0].id]);
    await insertItems(db, existing[0].id, breakdown.items);
    return { billId: existing[0].id, updated: true };
  }
  const [result] = await db.execute(
    `INSERT INTO bills (tenancy_id, billing_month, rent_amount, water_amount, electricity_amount, total_amount, due_date, status)
     VALUES (?,?,?,?,?,?,?,'unpaid')`, [tenancy.id, billingMonth, ...amounts]);
  await insertItems(db, result.insertId, breakdown.items);
  return { billId: result.insertId, created: true };
}

const insertItems = (db, billId, items) => Promise.all(items.map(i =>
  db.execute('INSERT INTO bill_items (bill_id, description, quantity, unit_price, amount) VALUES (?,?,?,?,?)',
    [billId, i.description, i.quantity, i.unit_price, i.amount])));

exports.generate = async (input, user) => transaction(async (db) => {
  const billingMonth = String(input.billingMonth).slice(0, 7) + '-01';
  const dueDate = input.dueDate || (await dayOfMonth(db, billingMonth, Number(input.dueDayOfMonth || 10)));
  const [[tenancy]] = await db.execute(
    `SELECT tn.*, r.house_id, te.user_id AS tenant_user_id
     FROM tenancies tn JOIN rooms r ON r.id = tn.room_id JOIN tenants te ON te.id = tn.tenant_id
     WHERE tn.id = ? FOR UPDATE`, [input.tenancyId]);
  if (!tenancy) throw httpError(404, 'Tenancy not found');
  if (!await canAccessHouse(user, tenancy.house_id)) throw httpError(404, 'Tenancy not found');
  if (tenancy.status !== 'active') throw httpError(409, 'Bills are only generated for active tenancies');
  const breakdown = await billCalcModel.breakdown({ ...input, tenancyId: tenancy.id, billingMonth });
  const result = await upsert(db, { tenancy, breakdown, dueDate, billingMonth });
  if (result.skipped) return { ...result, reason: 'Bill already paid' };
  if (tenancy.tenant_user_id) {
    await notify.notifyUser(db, {
      userId: tenancy.tenant_user_id,
      title: `Bill for ${billingMonth}`,
      message: `Total ${breakdown.total} due on ${dueDate}.`
    });
  }
  return { ...result, billingMonth, total: breakdown.total, breakdown };
});

exports.generateAll = async (input, user) => {
  const billingMonth = String(input.billingMonth).slice(0, 7) + '-01';
  const conditions = ["tn.status='active'"], params = [];
  if (input.houseId) { conditions.push('r.house_id = ?'); params.push(Number(input.houseId)); }
  if (user.role === 'staff') {
    if (!user.houseIds.length) return { billingMonth, processed: 0, results: [] };
    conditions.push(`r.house_id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else {
    return { billingMonth, processed: 0, results: [] };
  }
  const [tenancies] = await pool.execute(
    `SELECT tn.id, r.house_id FROM tenancies tn
     JOIN rooms r ON r.id = tn.room_id JOIN houses h ON h.id = r.house_id WHERE ${conditions.join(' AND ')}`, params);
  const results = [];
  for (const tenancy of tenancies) {
    try {
      results.push(await exports.generate({ ...input, tenancyId: tenancy.id, billingMonth }, user));
    } catch (e) {
      results.push({ tenancyId: tenancy.id, error: e.message });
    }
  }
  return { billingMonth, processed: results.length, results };
};

async function dayOfMonth(db, monthStart, day) {
  const [rows] = await db.execute('SELECT LEAST(?, DAY(LAST_DAY(?))) AS d', [day, monthStart]);
  return String(monthStart).slice(0, 7) + '-' + String(rows[0].d).padStart(2, '0');
}

exports.setStatusFromPayments = async (db, billId) => {
  await db.execute(
    `UPDATE bills b
     SET status = CASE
       WHEN (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.bill_id = b.id) >= b.total_amount THEN 'paid'
       WHEN (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.bill_id = b.id) > 0 THEN 'partial'
       ELSE b.status END
     WHERE b.id = ?`, [billId]);
  const [rows] = await db.execute('SELECT id, status, total_amount FROM bills WHERE id = ?', [billId]);
  return rows[0];
};

exports.void = async (id, user, reason) => {
  const bill = await exports.byIdForUser(id, user);
  if (!bill) throw httpError(404, 'Bill not found');
  if (bill.status === 'paid') throw httpError(409, 'A paid bill cannot be voided');
  await pool.execute("UPDATE bills SET status='void' WHERE id = ?", [id]);
  return { id, status: 'void', reason: reason ?? null };
};

exports.patch = async (id, data, user) => {
  const bill = await exports.byIdForUser(id, user);
  if (!bill) throw httpError(404, 'Bill not found');
  if (bill.status === 'paid') throw httpError(409, 'A paid bill cannot be edited');
  if (bill.status === 'void') throw httpError(409, 'A void bill cannot be edited');
  const columns = [], params = [];
  for (const field of ['rent_amount', 'water_amount', 'electricity_amount', 'late_fee']) {
    if (data[field] !== undefined) { columns.push(`${field} = ?`); params.push(Number(data[field])); }
  }
  if (data.due_date !== undefined) { columns.push('due_date = ?'); params.push(data.due_date); }
  if (columns.length) {
    const rent = data.rent_amount !== undefined ? Number(data.rent_amount) : Number(bill.rent_amount);
    const water = data.water_amount !== undefined ? Number(data.water_amount) : Number(bill.water_amount);
    const electricity = data.electricity_amount !== undefined ? Number(data.electricity_amount) : Number(bill.electricity_amount);
    const lateFee = data.late_fee !== undefined ? Number(data.late_fee) : Number(bill.late_fee);
    await pool.execute(
      `UPDATE bills SET ${columns.join(', ')}, total_amount = ? WHERE id = ?`,
      [...params, rent + water + electricity + lateFee, id]);
  }
  return exports.byIdForUser(id, user);
};

exports.remove = async (id, user) => {
  const bill = await exports.byIdForUser(id, user);
  if (!bill) throw httpError(404, 'Bill not found');
  const [[payments]] = await pool.execute('SELECT COUNT(*) AS n FROM payments WHERE bill_id = ?', [id]);
  if (Number(payments.n) > 0) throw httpError(409, 'A bill with recorded payments cannot be deleted; void it instead');
  await pool.execute('DELETE FROM bills WHERE id = ?', [id]);
};

// FULL OUTER JOIN emulation: MySQL 8 has no FULL OUTER JOIN syntax, so the matched and
// left rows come from a LEFT JOIN and orphan payment rows from the RIGHT JOIN branch.
exports.ledger = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`h.id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else if (user.role === 'tenant') {
    if (!user.tenantId) return [];
    conditions.push('tn.tenant_id = ?');
    params.push(user.tenantId);
  } else {
    return [];
  }
  if (filters.houseId) { conditions.push('h.id = ?'); params.push(Number(filters.houseId)); }
  if (filters.month) { conditions.push('b.billing_month = ?'); params.push(String(filters.month).slice(0, 7) + '-01'); }
  if (filters.status) { conditions.push('b.status = ?'); params.push(filters.status); }
  const [rows] = await pool.query(
    `SELECT * FROM (
       SELECT b.id AS bill_id, b.billing_month, b.due_date, b.total_amount, b.status AS bill_status,
              te.full_name AS tenant_name, r.room_number, h.name AS house_name,
              p.id AS payment_id, p.amount AS payment_amount, p.method, p.paid_at,
              CASE WHEN p.id IS NULL THEN 'bill_only' ELSE 'matched' END AS match_type
       FROM bills b
       JOIN tenancies tn ON tn.id = b.tenancy_id
       JOIN tenants te ON te.id = tn.tenant_id
       JOIN rooms r ON r.id = tn.room_id
       JOIN houses h ON h.id = r.house_id
       LEFT JOIN payments p ON p.bill_id = b.id
       ${where(conditions)}
       UNION ALL
       SELECT b.id, b.billing_month, b.due_date, b.total_amount, b.status,
              te.full_name, r.room_number, h.name,
              p.id, p.amount, p.method, p.paid_at,
              'payment_only'
       FROM bills b
       RIGHT JOIN payments p ON p.bill_id = b.id
       LEFT JOIN tenancies tn ON tn.id = b.tenancy_id
       LEFT JOIN tenants te ON te.id = tn.tenant_id
       LEFT JOIN rooms r ON r.id = tn.room_id
       LEFT JOIN houses h ON h.id = r.house_id
       WHERE b.id IS NULL
     ) ledger
     ORDER BY bill_id IS NULL, bill_id DESC, payment_id
     LIMIT ${limit(filters.limit, 500)}`, params);
  return rows;
};
