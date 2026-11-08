const { pool } = require('../config/db');
const { route, badIf, guard } = require('../utils/http');
const { httpError, id: isId } = require('../utils/validate');
const notificationModel = require('../models/notificationModel');
const audit = require('../utils/audit');

exports.list = route(async (body, req) => ({
  unread: await notificationModel.unreadCount(req.user.id),
  items: await notificationModel.listForUser(req.user, req.query)
}));

exports.markRead = route(async (body, req) => {
  const result = await notificationModel.markRead(req.user.id, req.params.id);
  if (!result) throw httpError(404, 'Notification not found');
  return result;
});

exports.markAllRead = route(async (body, req) => notificationModel.markAllRead(req.user.id));

exports.remove = route(async (body, req) => {
  const deleted = await notificationModel.remove(req.user.id, req.params.id);
  if (!deleted) throw httpError(404, 'Notification not found');
});

exports.clearRead = route(async (body, req) => notificationModel.removeAllRead(req.user.id));

// Announcements: landlord can message anyone; staff can message tenants and staff in their houses.
exports.create = route(async (body, req) => {
  guard(badIf(!isId(body.user_id), 400, 'user_id is required'),
    badIf(!body.title, 400, 'title is required'),
    badIf(!body.message, 400, 'message is required'));
  const recipientId = Number(body.user_id);
  if (req.user.role === 'staff') {
    const [rows] = await pool.execute(
      `SELECT r.house_id FROM tenancies tn
       JOIN tenants te ON te.id = tn.tenant_id
       JOIN rooms r ON r.id = tn.room_id
       WHERE te.user_id = ?
       UNION
       SELECT sa.house_id FROM staff_assignments sa WHERE sa.user_id = ?`,
      [recipientId, recipientId]);
    if (!rows.length) throw httpError(404, 'Recipient not found');
    if (!rows.some(row => req.user.houseIds.includes(row.house_id))) throw httpError(404, 'Recipient not found');
  } else if (req.user.role !== 'landlord') {
    throw httpError(403, 'Forbidden');
  } else {
    const [rows] = await pool.execute('SELECT id FROM users WHERE id = ?', [recipientId]);
    if (!rows[0]) throw httpError(404, 'Recipient not found');
  }
  const created = await notificationModel.create({
    user_id: recipientId,
    title: String(body.title).slice(0, 150),
    message: String(body.message).slice(0, 2000),
    channel: body.channel || 'in_app'
  });
  await audit.log(req, 'notification.create', 'notifications', created.id, { to_user: recipientId });
  return created;
}, 201);
