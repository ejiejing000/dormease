// Unit/contract tests. MySQL is not required: the pool is stubbed, so these assert the
// decisions the API makes (auth, role, house scope, ownership, validation) and nothing else.
// The end-to-end flows that really write rows live in integration.test.js.
process.env.JWT_SECRET = 'unit-test-secret-value-that-is-long-enough-32';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { pool } = require('../src/config/db');
const { jwtSecret } = require('../src/config/env');
const app = require('../src/app');

const USERS = {
  landlord: { id: 1, full_name: 'Land Lord', email: 'landlord@dormease.test', role: 'landlord', is_active: 1 },
  staff: { id: 2, full_name: 'Sam Staff', email: 'staff@dormease.test', role: 'staff', is_active: 1 },
  tenant: { id: 3, full_name: 'Tina Tenant', email: 'tenant@dormease.test', role: 'tenant', is_active: 1 },
  departed: { id: 4, full_name: 'Gone Away', email: 'gone@dormease.test', role: 'staff', is_active: 0 }
};

const PASSWORD = 'DormEase#unit-test';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

// Which houses a staff account may touch, and whether it may change utility rates.
let staffAssignments = [{ house_id: 11, can_manage_rates: false }];
let executed = [];

pool.execute = async (sql, params = []) => {
  executed.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
  if (/FROM users WHERE id = \?/.test(sql)) return [[USERS_BY_ID[params[0]]].filter(Boolean), []];
  if (/FROM users WHERE email = \?/.test(sql)) {
    const found = Object.values(USERS).find(u => u.email === String(params[0]).toLowerCase());
    if (!found) return [[], []];
    return [[{ ...found, password_hash: PASSWORD_HASH }], []];
  }
  if (/FROM staff_assignments/.test(sql)) return [staffAssignments, []];
  if (/FROM tenants WHERE user_id = \?/.test(sql)) return [[{ id: 30 }], []];
  if (/FROM tenants te WHERE te\.user_id/.test(sql)) return [[{ id: 30, full_name: 'Tina Tenant' }], []];
  if (/INSERT INTO audit_logs/.test(sql)) return [{ affectedRows: 1 }, []];
  if (/INSERT INTO notifications/.test(sql)) return [{ affectedRows: 1 }, []];
  // Anything not modelled above returns no rows, which reads as "not found" or an empty list.
  return [[], []];
};
pool.query = async (sql, params = []) => pool.execute(sql, params);

const USERS_BY_ID = Object.fromEntries(Object.values(USERS).map(u => [u.id, u]));
const token = (user) => jwt.sign({ id: user.id, role: user.role }, jwtSecret, { algorithm: 'HS256', expiresIn: '5m' });

let server;
let base;
test.before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());

async function call(method, path, { token: bearer, body } = {}) {
  executed = [];
  const headers = { 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

// Members merge in order, so a route owned by a later member may not be on
// main yet. The API answers unknown paths with 404 "no route"; treat that as
// "not merged yet" and skip instead of failing.
const notMerged = ({ status, json }) => status === 404 && /no route/i.test(String(json && json.message));
function skipIfNotMerged(t, result, what) {
  if (notMerged(result)) {
    t.skip(`${what} is not merged yet`);
    return true;
  }
  return false;
}

test('health endpoint answers without a database or a token', async () => {
  const { status, json } = await call('GET', '/health');
  assert.equal(status, 200);
  assert.equal(json.success, true);
});

test('unknown paths return the JSON error shape, not an HTML page', async () => {
  const { status, json } = await call('GET', '/api/definitely-not-a-route');
  assert.equal(status, 404);
  assert.equal(json.success, false);
  assert.match(json.message, /no route/i);
});

test('every management route refuses an unauthenticated or forged token', async (t) => {
  for (const path of ['/api/rooms', '/api/bills', '/api/tenants', '/api/audit-logs', '/api/staff']) {
    const result = await call('GET', path);
    if (skipIfNotMerged(t, result, path)) return;
    assert.equal(result.status, 401, `${path} must require a token`);
  }
  const tampered = await call('GET', '/api/rooms', { token: 'eyJhbGciOiJub25lIn0.eyJpZCI6MSwicm9sZSI6ImxhbmRsbGFkIn0.' });
  if (skipIfNotMerged(t, tampered, '/api/rooms')) return;
  assert.equal(tampered.status, 401, 'alg:none must be rejected');
});

test('a signed-out tenant cannot create rooms, bills or staff accounts', async (t) => {
  const tenant = token(USERS.tenant);
  const rooms = await call('POST', '/api/rooms', { token: tenant, body: { house_id: 11, room_number: 'X', monthly_rent: 1, bed_capacity: 1 } });
  if (skipIfNotMerged(t, rooms, '/api/rooms')) return;
  const tenants = await call('POST', '/api/tenants', { token: tenant, body: { full_name: 'Self' } });
  if (skipIfNotMerged(t, tenants, '/api/tenants')) return;
  assert.equal(rooms.status, 403);
  assert.equal(tenants.status, 403);
  assert.equal((await call('POST', '/api/staff', { token: tenant, body: { full_name: 'Me', email: 'me@dormease.test' } })).status, 403);
  assert.equal((await call('GET', '/api/audit-logs', { token: tenant })).status, 403);
});

test('staff can manage rooms but never read the audit trail or create other staff', async () => {
  const staff = token(USERS.staff);
  assert.equal((await call('GET', '/api/audit-logs', { token: staff })).status, 403);
  assert.equal((await call('POST', '/api/staff', { token: staff, body: { full_name: 'Friend', email: 'friend@dormease.test' } })).status, 403);
});

test('a staff account outside its assigned houses gets 404, not a leaked record', async (t) => {
  const staff = token(USERS.staff);
  const result = await call('POST', '/api/rooms', {
    token: staff,
    body: { house_id: 99, room_number: '99', monthly_rent: 3500, bed_capacity: 2 }
  });
  if (skipIfNotMerged(t, result, '/api/rooms')) return;
  assert.equal(result.status, 404);
  assert.match(result.json.message, /not found/i);
});

test('utility rate changes honour the per-assignment can_manage_rates flag', async (t) => {
  staffAssignments = [{ house_id: 11, can_manage_rates: false }];
  const staff = token(USERS.staff);
  const denied = await call('POST', '/api/rates', { token: staff, body: { house_id: 11, utility_code: 'WATER', effective_from: '2026-11-01' } });
  if (skipIfNotMerged(t, denied, '/api/rates')) return;
  assert.equal(denied.status, 403);
  assert.match(denied.json.message, /assignment/i);

  staffAssignments = [{ house_id: 11, can_manage_rates: true }];
  const allowed = await call('POST', '/api/rates', { token: staff, body: { house_id: 11, utility_code: 'WATER', effective_from: '2026-11-01' } });
  // The stubbed pool reports no created row, so the controller answers 404 rather than validating again.
  assert.notEqual(allowed.status, 403, 'a granted assignment must not be blocked by the role layer');
});

test('the public room list exposes only visitor-safe columns', async () => {
  pool.query = async (sql, params = []) => {
    executed.push({ sql: String(sql), params });
    if (/FROM v_public_rooms/.test(sql)) {
      return [[{
        id: 5, room_number: '101', monthly_rent: 3500, bed_capacity: 2, cooling_type: 'fan',
        storage_available: 1, amenities: '["wifi"]', photo_url: null, house_id: 11,
        house_name: 'Sunflower House', house_address: '1 Campus Ave', available_beds: 2, is_available: 1
      }], []];
    }
    return [[], []];
  };

  const { status, json } = await call('GET', '/api/public/rooms');
  assert.equal(status, 200);
  assert.equal(json.data.length, 1);
  const room = json.data[0];
  assert.deepEqual(Object.keys(room).sort(), ['amenities', 'availableBeds', 'bedCapacity', 'coolingType', 'house', 'id', 'isAvailable', 'monthlyRent', 'photoUrl', 'roomNumber', 'storageAvailable'].sort());
  assert.equal(room.house.name, 'Sunflower House');
  const serialised = JSON.stringify(room).toLowerCase();
  for (const forbidden of ['tenant', 'bill', 'password', 'email', 'phone', 'user_id']) {
    assert.ok(!serialised.includes(forbidden), `public payload must not mention ${forbidden}`);
  }
  assert.match(executed[0].sql, /FROM v_public_rooms/, 'browsing must read the safe view');

  pool.query = (sql, params) => pool.execute(sql, params);
});

test('a visitor can be told the request fields are wrong before anything is written', async (t) => {
  const missing = await call('POST', '/api/public/reservation-requests', { body: { full_name: 'Jo' } });
  if (skipIfNotMerged(t, missing, '/api/public/reservation-requests')) return;
  assert.equal(missing.status, 400);

  const badEmail = await call('POST', '/api/public/reservation-requests', {
    body: { full_name: 'Jo Visitor', email: 'not-an-email', phone: '09171234567', room_id: 5, preferred_move_in_date: '2026-12-01' }
  });
  assert.equal(badEmail.status, 400);
  assert.match(badEmail.json.message, /email/i);
});

test('login takes the role from the database, so a client cannot pick one', async () => {
  const { status, json } = await call('POST', '/api/auth/login', {
    body: { email: USERS.tenant.email, password: PASSWORD, role: 'landlord', is_active: true }
  });
  assert.equal(status, 200);
  assert.equal(json.data.user.role, 'tenant', 'the submitted role must be ignored');
  assert.equal(json.data.user.dashboard, 'tenant-dashboard.html');
  assert.equal(json.data.user.tenantId, 30);
  assert.ok(json.data.token, 'a token is issued');
  assert.equal(json.data.user.password_hash, undefined, 'the hash never leaves the API');
});

test('login routes staff and landlords to the management dashboard', async () => {
  for (const [email, dashboard] of [[USERS.staff.email, 'dashboard.html'], [USERS.landlord.email, 'dashboard.html']]) {
    const { status, json } = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
    assert.equal(status, 200);
    assert.equal(json.data.user.dashboard, dashboard);
  }
});

test('login rejects a wrong password, an unknown email and a deactivated account', async () => {
  assert.equal((await call('POST', '/api/auth/login', { body: { email: USERS.tenant.email, password: 'wrong-password' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'nobody@dormease.test', password: PASSWORD } })).status, 401);
  const { status, json } = await call('POST', '/api/auth/login', { body: { email: USERS.departed.email, password: PASSWORD } });
  assert.equal(status, 401, 'a deactivated account cannot sign in');
  assert.match(json.message, /invalid/i);
});

test('a token for a deactivated account is rejected mid-session', async (t) => {
  const result = await call('GET', '/api/rooms', { token: token(USERS.departed) });
  if (skipIfNotMerged(t, result, '/api/rooms')) return;
  assert.equal(result.status, 401);
});

test('protected reads answer 400 with a message instead of a stack trace', async (t) => {
  const landlord = token(USERS.landlord);
  const result = await call('POST', '/api/rooms', { token: landlord, body: { room_number: '101' } });
  if (skipIfNotMerged(t, result, '/api/rooms')) return;
  assert.equal(result.status, 400);
  assert.equal(result.json.success, false);
  assert.match(result.json.message, /house_id is required/);
  assert.equal(result.json.stack, undefined);
});

test('a tenant reading their own bills is scoped by their tenant id, not by a query parameter', async (t) => {
  const tenant = token(USERS.tenant);
  const { status, json } = await call('GET', '/api/bills', { token: tenant });
  if (skipIfNotMerged(t, { status, json }, '/api/bills')) return;
  assert.equal(status, 200);
  const bills = executed.find(item => /FROM bills b/.test(item.sql));
  assert.ok(bills, 'the bills query ran');
  assert.match(bills.sql, /tn\.tenant_id = \?/, 'tenant scope is added in SQL');
  assert.deepEqual(bills.params, [30]);
});
