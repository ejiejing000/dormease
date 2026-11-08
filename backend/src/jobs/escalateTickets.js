const { pool } = require('../config/db');
const { ticketSlaHours } = require('../config/env');
const audit = require('../utils/audit');

module.exports = async function escalateTickets() {
  const hours = Number(ticketSlaHours || 48);
  const [stale] = await pool.execute(
    `SELECT mt.id, mt.title, mt.tenancy_id FROM maintenance_tickets mt
     WHERE mt.status IN ('open','in_progress') AND mt.created_at <= DATE_SUB(NOW(), INTERVAL ? HOUR)
       AND mt.escalated_at IS NULL`, [hours]);
  for (const ticket of stale) {
    // The BEFORE UPDATE trigger stamps escalated_at, which makes this sweep safe to re-run.
    await pool.execute("UPDATE maintenance_tickets SET status='escalated' WHERE id = ? AND escalated_at IS NULL", [ticket.id]);
    await pool.execute(
      `INSERT INTO ticket_status_history(ticket_id,status,note) VALUES(?,?,?)`,
      [ticket.id, 'escalated', `Auto-escalated after ${hours}h without resolution`]);
    await pool.execute(
      `INSERT INTO notifications(user_id,title,message)
       SELECT h.owner_user_id, 'Ticket escalated', CONCAT(?, ' has been open past the SLA.')
       FROM tenancies tn JOIN rooms r ON r.id = tn.room_id JOIN houses h ON h.id = r.house_id
       WHERE tn.id = ? AND h.owner_user_id IS NOT NULL`, [ticket.title, ticket.tenancy_id]);
  }
  if (stale.length) await audit.systemLog('ticket.escalation_sweep', 'maintenance_tickets', null, { tickets: stale.length, hours });
  return { processed: stale.length };
};
