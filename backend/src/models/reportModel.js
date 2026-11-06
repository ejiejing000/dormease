const { pool } = require('../config/db');
const { inList } = require('./query');

async function houseFilter(user) {
  if (user.role === 'staff') {
    return user.houseIds.length
      ? { sql: ` AND r.house_id IN (${inList(user.houseIds)})`, params: user.houseIds }
      : { sql: ' AND FALSE', params: [] };
  }
  if (user.role === 'landlord') {
    return { sql: ` AND (h.owner_user_id = ? OR h.owner_user_id IS NULL)`, params: [user.id] };
  }
  return { sql: '', params: [] };
}

exports.occupancy = async (user) => {
  const f = await houseFilter(user);
  const [rows] = await pool.query(
    `SELECT h.id, h.name, COUNT(DISTINCT r.id) AS rooms,
            SUM(r.bed_capacity) AS beds,
            SUM(GREATEST(0, r.bed_capacity - v.available_beds)) AS occupied_beds,
            SUM(v.available_beds) AS free_beds
     FROM houses h JOIN rooms r ON r.house_id = h.id
     JOIN v_room_availability v ON v.room_id = r.id
     WHERE r.is_listed = TRUE${f.sql}
     GROUP BY h.id, h.name ORDER BY h.name`, f.params);
  return rows.map(r => ({
    ...r,
    occupancy_rate: Number(r.beds) ? Number((Number(r.beds) - Number(r.free_beds)) / Number(r.beds) * 100).toFixed(1) : 0
  }));
};

exports.collections = async (user) => {
  const f = await houseFilter(user);
  const [rows] = await pool.query(
    `SELECT b.status, COUNT(*) AS bills, COALESCE(SUM(b.total_amount),0) AS billed,
            COALESCE(SUM((SELECT SUM(p.amount) FROM payments p WHERE p.bill_id = b.id)),0) AS collected
     FROM bills b JOIN tenancies tn ON tn.id = b.tenancy_id JOIN rooms r ON r.id = tn.room_id
     JOIN houses h ON h.id = r.house_id${f.sql}
     GROUP BY b.status ORDER BY b.status`, f.params);
  return rows.map(r => ({
    status: r.status,
    bills: r.bills,
    billed: Number(r.billed),
    collected: Number(r.collected),
    outstanding: Number((Number(r.billed) - Number(r.collected)).toFixed(2))
  }));
};

exports.monthlyIncome = async (user, monthsBack = 12) => {
  const f = await houseFilter(user);
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(p.paid_at,'%Y-%m') AS month, COALESCE(SUM(p.amount),0) AS income
     FROM payments p JOIN bills b ON b.id = p.bill_id
     JOIN tenancies tn ON tn.id = b.tenancy_id JOIN rooms r ON r.id = tn.room_id
     JOIN houses h ON h.id = r.house_id
     WHERE p.paid_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)${f.sql}
     GROUP BY month ORDER BY month`, [Number(monthsBack), ...f.params]);
  return rows.map(r => ({ month: r.month, income: Number(r.income) }));
};

exports.summary = async (user) => {
  const f = await houseFilter(user);
  const [counts] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM tenancies tn JOIN rooms r ON r.id = tn.room_id JOIN houses h ON h.id = r.house_id
              WHERE tn.status='active'${f.sql}) AS active_tenancies,
            (SELECT COUNT(*) FROM reservation_requests rq JOIN rooms r ON r.id = rq.room_id JOIN houses h ON h.id = r.house_id
              WHERE rq.status='pending'${f.sql}) AS pending_requests,
            (SELECT COUNT(*) FROM maintenance_tickets mt JOIN tenancies tn ON tn.id = mt.tenancy_id
              JOIN rooms r ON r.id = tn.room_id JOIN houses h ON h.id = r.house_id
              WHERE mt.status IN ('open','in_progress','escalated')${f.sql}) AS open_tickets,
            (SELECT COALESCE(SUM(b.total_amount),0) FROM bills b JOIN tenancies tn ON tn.id = b.tenancy_id
              JOIN rooms r ON r.id = tn.room_id JOIN houses h ON h.id = r.house_id
              WHERE b.status IN ('unpaid','partial','overdue')${f.sql}) AS outstanding`,
    [...f.params, ...f.params, ...f.params, ...f.params]);
  return counts[0];
};

exports.tenantStatement = async (tenantId, user) => {
  if (user.role !== 'landlord' && user.role !== 'staff') throw Object.assign(new Error('Forbidden'), { status: 403 });
  const [bills] = await pool.execute(
    `SELECT b.*, DATE_FORMAT(b.billing_month,'%Y-%m') AS month,
            (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.bill_id = b.id) AS paid
     FROM bills b WHERE b.tenancy_id IN (SELECT id FROM tenancies WHERE tenant_id = ?) ORDER BY b.billing_month DESC`,
    [tenantId]);
  const [tenancies] = await pool.execute(
    `SELECT tn.*, r.room_number, h.name AS house_name FROM tenancies tn
     JOIN rooms r ON r.id = tn.room_id JOIN houses h ON h.id = r.house_id WHERE tn.tenant_id = ?`, [tenantId]);
  return { tenancies, bills: bills.map(b => ({ ...b, outstanding: Number((Number(b.total_amount) - Number(b.paid)).toFixed(2)) })) };
};
