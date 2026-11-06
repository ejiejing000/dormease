// End-to-end lifecycle against a real MySQL database.
// Skipped unless TEST_DB=1, because it writes rows. Prepare a throwaway seeded schema first:
//   npm run db:setup -- --db dormease_test
//   TEST_DB=1 DB_NAME=dormease_test npm test
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret-value-long-enough';

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { pool } = require('../src/config/db');
const env = require('../src/config/env');

const enabled = process.env.TEST_DB === '1';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DormEase#2026';

let base;
let server;
test.before(async () => {
  if (!enabled) return;
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

// The MySQL pool keeps a handle open; without this the run never exits.
test.after(async () => {
  if (!enabled || !server) return;
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, data: json.data, message: json.message };
}

async function login(email, password = DEMO_PASSWORD) {
  const result = await call('POST', '/api/auth/login', { body: { email, password } });
  assert.equal(result.status, 200, `login failed for ${email}: ${result.message}`);
  return result.data;
}

test('visitor → request → approval → invitation → tenant billing lifecycle', {
  skip: enabled ? false : 'set TEST_DB=1 and point DB_* at a seeded test schema'
}, async () => {
  const stamp = Date.now();
  const applicant = {
    full_name: `Integration Visitor ${stamp}`,
    email: `visitor${stamp}@example.com`,
    phone: '09170001234',
    message: 'Second-year student, would like a fan room.'
  };

  // 1. A visitor browses without any account.
  const provisioner = await login('landlord@example.com');
  let rooms = await call('GET', '/api/public/rooms?availableOnly=1');
  assert.equal(rooms.status, 200);
  if (!rooms.data.length) {
    // Every earlier run of this file leaves an active lease behind, so on a database that has been
    // tested against before, all the seeded beds can be taken. Provision a room of our own instead
    // of failing, which keeps the lifecycle re-runnable without dropping the schema.
    const created = await call('POST', '/api/rooms', {
      token: provisioner.token,
      body: { house_id: 1, room_number: `IT-${stamp}`, monthly_rent: 3000, bed_capacity: 2, cooling_type: 'fan' }
    });
    assert.equal(created.status, 201, created.message);
    rooms = await call('GET', '/api/public/rooms?availableOnly=1');
  }
  assert.ok(rooms.data.length, 'a publicly listed room with a free bed is browsable without an account');
  const room = rooms.data[0];
  assert.equal(room.house.id >= 1, true);
  assert.equal(room.availableBeds > 0, true);

  const detail = await call('GET', `/api/public/rooms/${room.id}`);
  assert.equal(detail.status, 200);
  assert.ok(!JSON.stringify(detail.data).includes('password'));

  // 2. The visitor submits a reservation request and can check it later with id + email.
  const submitted = await call('POST', '/api/public/reservation-requests', {
    body: { ...applicant, room_id: room.id, preferred_move_in_date: nextMonthFirstDay() }
  });
  assert.equal(submitted.status, 201, submitted.message);
  const requestId = submitted.data.id;

  const status = await call('GET', `/api/public/reservation-requests/status?id=${requestId}&email=${encodeURIComponent(applicant.email)}`);
  assert.equal(status.status, 200);
  assert.equal(status.data.status, 'pending');

  // A wrong email must not reveal the request.
  const wrongEmail = await call('GET', `/api/public/reservation-requests/status?id=${requestId}&email=someone@example.com`);
  assert.equal(wrongEmail.status, 404);

  // 3. Staff or landlord approves; that is what creates the tenant, reservation and lease.
  const staff = await login('staff@example.com');
  const approved = await call('POST', `/api/reservation-requests/${requestId}/approve`, {
    token: staff.token,
    body: { start_tenancy: true, occupants: 1, note: 'Approved during integration run' }
  });
  assert.equal(approved.status, 200, approved.message);
  assert.ok(approved.data.tenantId, 'an official tenant record was created');
  assert.ok(approved.data.reservationId, 'an approved reservation was created');
  assert.ok(approved.data.tenancyId, 'a tenancy was started');
  assert.ok(approved.data.invitation_url, 'a one-time invitation link was returned once');
  const tokenString = new URL(approved.data.invitation_url).searchParams.get('token');
  assert.ok(tokenString && tokenString.length >= 32, 'the invitation carries a long random token');

  // The raw token is never stored: only its sha256 hash is.
  const [hashRows] = await pool.execute('SELECT token_hash FROM account_invitations WHERE tenant_id = ?', [approved.data.tenantId]);
  assert.ok(hashRows.length, 'the invitation was persisted');
  assert.ok(!hashRows.some(row => String(row.token_hash) === tokenString), 'the plain token is not stored');

  // 4. The applicant sets a password with that invitation and becomes a signed-in tenant.
  const invited = await call('GET', `/api/invitations/${tokenString}`);
  assert.equal(invited.status, 200);
  assert.equal(invited.data.email, applicant.email);

  const tenantPassword = `Integration#tenant-${stamp}`;
  const accepted = await call('POST', '/api/invitations/accept', { body: { token: tokenString, password: tenantPassword } });
  assert.equal(accepted.status, 201, accepted.message);
  assert.equal(accepted.data.user.role, 'tenant');

  // The same link cannot be used twice.
  const replayed = await call('POST', '/api/invitations/accept', { body: { token: tokenString, password: tenantPassword } });
  assert.equal(replayed.status, 404, 'a used invitation is refused');

  // 5. The tenant now sees exactly one lease, and cannot reach management endpoints.
  const tenantSession = await login(applicant.email, tenantPassword);
  const lease = await call('GET', '/api/tenancies', { token: tenantSession.token });
  assert.equal(lease.status, 200);
  assert.equal(lease.data.length, 1);
  assert.equal(lease.data[0].id, approved.data.tenancyId);
  assert.equal((await call('GET', '/api/audit-logs', { token: tenantSession.token })).status, 403);
  assert.equal((await call('POST', '/api/rooms', { token: tenantSession.token, body: { house_id: room.house.id, room_number: 'X', monthly_rent: 1, bed_capacity: 1 } })).status, 403);

  // 6. Billing starts only now: preview, generate, pay, receipt.
  const month = nextMonth().slice(0, 7);
  const preview = await call('POST', '/api/bill-preview', {
    token: staff.token,
    body: { tenancy_id: approved.data.tenancyId, billing_month: month, water_units: 12, electricity_units: 30 }
  });
  assert.equal(preview.status, 200, preview.message);
  assert.ok(preview.data.total > 0, 'the engine produced a non-zero total');

  const generated = await call('POST', '/api/bills/generate', {
    token: staff.token,
    body: { tenancy_id: approved.data.tenancyId, billing_month: month, water_units: 12, electricity_units: 30 }
  });
  assert.equal(generated.status, 201, generated.message);
  const billId = generated.data.billId;

  const tenantBills = await call('GET', '/api/bills', { token: tenantSession.token });
  assert.ok(tenantBills.data.some(bill => bill.id === billId), 'the tenant can read the new bill');

  const bill = await call('GET', `/api/bills/${billId}`, { token: tenantSession.token });
  assert.ok(bill.data.items.length, 'the bill is itemised');

  // Overpayment is refused, the correct amount closes the bill.
  const tooMuch = await call('POST', '/api/payments', {
    token: staff.token,
    body: { bill_id: billId, amount: Number(bill.data.total_amount) + 500, method: 'cash' }
  });
  assert.equal(tooMuch.status, 400, 'a payment cannot exceed the outstanding balance');

  const paid = await call('POST', '/api/payments', {
    token: staff.token,
    body: { bill_id: billId, amount: Number(bill.data.total_amount), method: 'bank_transfer', reference_no: `IT-${stamp}` }
  });
  assert.equal(paid.status, 201, paid.message);

  const receipt = await call('GET', `/api/payments/${paid.data.id}/receipt`, { token: tenantSession.token });
  assert.equal(receipt.status, 200);
  assert.equal(receipt.data.bill.status, 'paid');

  // 7. The tenant raises a maintenance ticket; another tenant cannot read it.
  const ticket = await call('POST', '/api/tickets', {
    token: tenantSession.token,
    body: { tenancy_id: approved.data.tenancyId, title: 'Fan makes a noise', description: 'Clicking sound at night.', priority: 'normal' }
  });
  assert.equal(ticket.status, 201, ticket.message);

  const otherTenant = await login('tenant@example.com');
  const snooping = await call('GET', `/api/tickets/${ticket.data.id}`, { token: otherTenant.token });
  assert.equal(snooping.status, 404, 'another tenant cannot read this ticket');

  const resolved = await call('PATCH', `/api/tickets/${ticket.data.id}/status`, {
    token: staff.token, body: { status: 'resolved', note: 'Fan bearing replaced' }
  });
  assert.equal(resolved.status, 200, resolved.message);
});

test('a staff account limited to one house cannot act on another house', {
  skip: enabled ? false : 'set TEST_DB=1 and point DB_* at a seeded test schema'
}, async () => {
  const staff = await login('staff@example.com');
  const rooms = await call('GET', '/api/rooms', { token: staff.token });
  assert.equal(rooms.status, 200);
  const houseIds = [...new Set(rooms.data.map(room => room.house_id))];
  assert.deepEqual(houseIds, staff.user.houseIds, 'the room list is limited to the assigned houses');
});

// Reads were already scoped through the owner filter, but the reservation status writes only tested
// staff, so a landlord could approve, hold or cancel a reservation sitting in someone else's house.
test('a landlord cannot change a reservation in another landlord\'s house', {
  skip: enabled ? false : 'set TEST_DB=1 and point DB_* at a seeded test schema'
}, async () => {
  const bcrypt = require('bcryptjs');
  const stamp = Date.now();
  const [owner] = await pool.execute(
    "INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES ('Other Owner', ?, ?, 'landlord', TRUE)",
    [`owner${stamp}@example.com`, await bcrypt.hash(DEMO_PASSWORD, 12)]);
  const [house] = await pool.execute(
    'INSERT INTO houses (name, address, owner_user_id, is_active) VALUES (?, ?, ?, TRUE)',
    [`Foreign House ${stamp}`, 'Nowhere', owner.insertId]);
  const [room] = await pool.execute(
    "INSERT INTO rooms (house_id, room_number, monthly_rent, bed_capacity, cooling_type, is_listed) VALUES (?, 'F1', 5000, 2, 'fan', TRUE)",
    [house.insertId]);
  const [reservation] = await pool.execute(
    "INSERT INTO reservations (tenant_id, room_id, start_date, status, source) VALUES (3, ?, ?, 'pending', 'staff_created')",
    [room.insertId, nextMonthFirstDay()]);

  const intruder = await login('landlord@example.com');
  const held = await call('POST', `/api/reservations/${reservation.insertId}/hold`, { token: intruder.token, body: {} });
  assert.equal(held.status, 404, 'holding a foreign reservation is refused without revealing it');
  const approved = await call('POST', `/api/reservations/${reservation.insertId}/approve`, { token: intruder.token, body: {} });
  assert.equal(approved.status, 404, 'approving a foreign reservation is refused');

  const [rows] = await pool.execute('SELECT status FROM reservations WHERE id = ?', [reservation.insertId]);
  assert.equal(rows[0].status, 'pending', 'the foreign reservation is untouched');

  const ownerSession = await call('POST', `/api/reservations/${reservation.insertId}/hold`, { token: (await login(`owner${stamp}@example.com`)).token, body: {} });
  assert.equal(ownerSession.status, 200, 'the real owner can still act on it');

  await pool.execute('DELETE FROM reservations WHERE id = ?', [reservation.insertId]);
  await pool.execute('DELETE FROM rooms WHERE id = ?', [room.insertId]);
  await pool.execute('DELETE FROM houses WHERE id = ?', [house.insertId]);
  await pool.execute('DELETE FROM users WHERE id = ?', [owner.insertId]);
});

function nextMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1, 1);
  return date.toISOString().slice(0, 10);
}

function nextMonthFirstDay() {
  return nextMonth();
}
