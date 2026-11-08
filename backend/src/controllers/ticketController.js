const { route, badIf, guard } = require('../utils/http');
const { httpError, id: isId } = require('../utils/validate');
const ticketModel = require('../models/ticketModel');
const audit = require('../utils/audit');

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

exports.list = route(async (body, req) => ticketModel.listForUser(req.user, req.query));

exports.historyReport = route(async (body, req) => ticketModel.historyReport(req.user, req.query));

exports.get = route(async (body, req) => {
  const ticket = await ticketModel.byIdForUser(req.params.id, req.user);
  if (!ticket) throw httpError(404, 'Ticket not found');
  return ticket;
});

exports.create = route(async (body, req) => {
  guard(badIf(body.tenancy_id !== undefined && !isId(body.tenancy_id), 400, 'tenancy_id is not valid'),
    // Only a tenant may leave it out, in which case their own active lease is used.
    badIf(req.user.role !== 'tenant' && !isId(body.tenancy_id), 400, 'tenancy_id is required'),
    badIf(!body.title || String(body.title).trim().length < 3, 400, 'title is required'),
    badIf(!body.description, 400, 'description is required'),
    badIf(body.priority && !PRIORITIES.includes(body.priority), 400, `priority must be one of ${PRIORITIES.join(', ')}`));
  const ticket = await ticketModel.create({
    tenancy_id: body.tenancy_id ? Number(body.tenancy_id) : null,
    title: String(body.title).slice(0, 150),
    description: String(body.description).slice(0, 4000),
    priority: body.priority || 'normal'
  }, req.user);
  await audit.log(req, 'ticket.create', 'maintenance_tickets', ticket.id, { priority: ticket.priority });
  return ticket;
}, 201);

exports.setStatus = route(async (body, req) => {
  const ticket = await ticketModel.setStatus(req.params.id, body.status, req.user, body.note ?? null);
  await audit.log(req, `ticket.${body.status}`, 'maintenance_tickets', Number(req.params.id), { note: body.note ?? null });
  return ticket;
});

exports.update = route(async (body, req) => {
  guard(badIf(body.title !== undefined && String(body.title).trim().length < 3, 400, 'title must be at least 3 characters'),
    badIf(body.priority && !PRIORITIES.includes(body.priority), 400, `priority must be one of ${PRIORITIES.join(', ')}`));
  const ticket = await ticketModel.patch(req.params.id, body, req.user);
  await audit.log(req, 'ticket.update', 'maintenance_tickets', Number(req.params.id), body);
  return ticket;
});

exports.remove = route(async (body, req) => {
  await ticketModel.remove(req.params.id, req.user);
  await audit.log(req, 'ticket.delete', 'maintenance_tickets', Number(req.params.id));
});
