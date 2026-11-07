const jwt = require('jsonwebtoken');
const { pool, transaction } = require('../config/db');
const { route, badIf, guard } = require('../utils/http');
const { httpError, email: isEmail, id: isId } = require('../utils/validate');
const { appUrl, jwtSecret, jwtExpiresIn } = require('../config/env');
const invitationModel = require('../models/invitationModel');
const tenantModel = require('../models/tenantModel');
const userModel = require('../models/userModel');
const notify = require('../utils/notify');
const audit = require('../utils/audit');

const DASHBOARD = { landlord: 'dashboard.html', staff: 'dashboard.html', tenant: 'tenant-dashboard.html' };
const sign = user => jwt.sign({ id: user.id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn, algorithm: 'HS256' });

// The set-password page calls this to show who the invitation belongs to before asking for a password.
exports.info = route(async (body, req) => {
  const invitation = await invitationModel.findActive(pool, req.params.token);
  if (!invitation) throw httpError(404, 'This invitation is not valid, has been used, or has expired');
  return {
    full_name: invitation.full_name,
    email: invitation.email,
    expires_at: invitation.expires_at,
    has_account: Boolean(invitation.user_id)
  };
});

// No public sign-up: this is the only way a tenant account password is created,
// and it requires an unexpired, single-use invitation issued by landlord or staff.
exports.accept = route(async (body) => {
  guard(badIf(!body.token, 400, 'Invitation token is required'),
    badIf(!body.password || String(body.password).length < 10, 400, 'Password must be at least 10 characters'));
  const result = await transaction(async (db) => {
    const invitation = await invitationModel.findActive(db, body.token);
    if (!invitation) throw httpError(404, 'This invitation is not valid, has been used, or has expired');
    const [taken] = await db.execute('SELECT id, role FROM users WHERE email = ?', [invitation.email]);
    let userId = invitation.user_id;
    if (taken[0] && taken[0].id !== userId) throw httpError(409, 'An account already uses this email. Sign in instead.');
    if (!userId) {
      const created = await userModel.create(
        { full_name: invitation.full_name, email: invitation.email, password: body.password, role: 'tenant' }, db);
      userId = created.id;
      await tenantModel.linkUser(db, invitation.tenant_id, userId);
    } else {
      await userModel.setPassword(db, userId, body.password);
    }
    await invitationModel.markAccepted(db, invitation.id);
    await db.execute('INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)',
      [userId, 'Account ready', 'Your DORMEASE tenant account is active. Sign in to see your room, bills and tickets.']);
    return { userId, tenantId: invitation.tenant_id };
  });
  const user = await userModel.findById(result.userId);
  await audit.systemLog('invitation.accepted', 'user', result.userId, { tenant_id: result.tenantId });
  return { user, token: sign(user), dashboard: DASHBOARD[user.role] };
}, 201);

exports.list = route(async (body, req) => invitationModel.listForUser(req.user, req.query));

exports.coverage = route(async (body, req) => invitationModel.coverage(req.user));

exports.create = route(async (body, req) => {
  guard(badIf(!isId(body.tenant_id), 400, 'tenant_id is required'));
  const tenant = await tenantModel.findForUser(Number(body.tenant_id), req.user);
  if (!tenant) throw httpError(404, 'Tenant not found');
  if (tenant.user_id) throw httpError(409, 'This tenant already has an account');
  const email = String(body.email || tenant.email || '').trim().toLowerCase();
  guard(badIf(!isEmail(email), 400, 'A valid email is required to send an invitation'));
  const invite = await transaction(async (db) => {
    const created = await invitationModel.create(db, { tenantId: tenant.id, email, actorUserId: req.user.id });
    await notify.queue(db, {
      recipient: email,
      subject: 'Set up your DORMEASE tenant account',
      body: `Hello ${tenant.full_name},\n\nOpen this one-time link to create your password (it expires with the invitation): ${appUrl}/pages/set-password.html?token=${created.token}\n`
    });
    return created;
  });
  await audit.log(req, 'invitation.create', 'account_invitations', invite.id, { tenant_id: tenant.id, email });
  return {
    id: invite.id,
    tenantId: tenant.id,
    email,
    invitation_url: `${appUrl}/pages/set-password.html?token=${invite.token}`,
    expires_in_hours: invite.expiresInHours
  };
}, 201);

// Revoking is the update operation for an invitation: the row stays as history.
exports.revoke = route(async (body, req) => {
  const invitation = await invitationModel.byId(req.params.id);
  if (!invitation) throw httpError(404, 'Invitation not found');
  if (!await tenantModel.findForUser(invitation.tenant_id, req.user)) throw httpError(404, 'Invitation not found');
  if (invitation.accepted_at) throw httpError(409, 'An accepted invitation cannot be revoked');
  await invitationModel.revoke(invitation.id);
  await audit.log(req, 'invitation.revoke', 'account_invitations', invitation.id);
  return { id: invitation.id, status: 'expired' };
});

exports.remove = route(async (body, req) => {
  const invitation = await invitationModel.byId(req.params.id);
  if (!invitation) throw httpError(404, 'Invitation not found');
  if (!await tenantModel.findForUser(invitation.tenant_id, req.user)) throw httpError(404, 'Invitation not found');
  if (invitation.accepted_at) throw httpError(409, 'An accepted invitation is kept as account history');
  await invitationModel.remove(invitation.id);
  await audit.log(req, 'invitation.delete', 'account_invitations', invitation.id);
});
