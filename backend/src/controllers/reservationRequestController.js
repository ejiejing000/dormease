const { route, badIf, guard } = require('../utils/http');
const { httpError, id: isId } = require('../utils/validate');
const { appUrl } = require('../config/env');
const requestModel = require('../models/reservationRequestModel');
const audit = require('../utils/audit');

exports.list = route(async (body, req) => requestModel.listForUser(req.user, req.query));

exports.get = route(async (body, req) => {
  const found = await requestModel.findForUser(req.params.id, req.user);
  if (!found) throw httpError(404, 'Reservation request not found');
  return found;
});

// Only landlord/staff inside the room's house can approve, and approval is what turns a
// visitor into an official tenant with a reservation, optional lease and account invitation.
exports.approve = route(async (body, req) => {
  guard(badIf(!isId(req.params.id), 400, 'Request id is not valid'));
  const visible = await requestModel.findForUser(req.params.id, req.user);
  if (!visible) throw httpError(404, 'Reservation request not found');
  const result = await requestModel.approve(req.params.id, req.user, {
    startTenancy: Boolean(body.start_tenancy),
    moveInDate: body.move_in_date || null,
    occupants: body.occupants || 1,
    note: body.note ? String(body.note).slice(0, 255) : null,
    sendInvite: body.send_invite !== false
  });
  const { invitationToken, ...safe } = result;
  await audit.log(req, 'reservation_request.approve', 'reservation_request', Number(req.params.id),
    { tenant_id: safe.tenantId, reservation_id: safe.reservationId, tenancy_id: safe.tenancyId });
  return {
    ...safe,
    invitation_url: invitationToken ? `${appUrl}/pages/set-password.html?token=${invitationToken}` : null
  };
});

exports.reject = route(async (body, req) => {
  const visible = await requestModel.findForUser(req.params.id, req.user);
  if (!visible) throw httpError(404, 'Reservation request not found');
  const result = await requestModel.reject(req.params.id, req.user, { note: body.note ? String(body.note).slice(0, 255) : null });
  await audit.log(req, 'reservation_request.reject', 'reservation_request', Number(req.params.id), { note: body.note ?? null });
  return result;
});
