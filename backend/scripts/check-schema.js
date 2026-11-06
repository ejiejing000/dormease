// Compares an existing database against what the member schema fragments define,
// so a legacy dormease schema can be brought forward instead of dropped.
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const EXPECTED = {
  staff_assignments: ['user_id', 'house_id', 'can_manage_rates'],
  houses: ['name', 'address', 'description', 'owner_user_id', 'is_active'],
  rooms: ['house_id', 'room_number', 'monthly_rent', 'bed_capacity', 'cooling_type', 'storage_available', 'amenities', 'photo_url', 'is_listed'],
  tenants: ['user_id', 'full_name', 'email', 'phone'],
  reservation_requests: ['room_id', 'full_name', 'email', 'phone', 'preferred_move_in_date', 'message', 'status', 'reviewed_by', 'reviewed_at', 'review_note', 'created_reservation_id'],
  reservations: ['tenant_id', 'room_id', 'start_date', 'status', 'source', 'hold_expires_at'],
  tenancies: ['tenant_id', 'room_id', 'start_date', 'end_date', 'status', 'occupants'],
  utility_types: ['code', 'name'],
  utility_rates: ['house_id', 'utility_type_id', 'fixed_charge', 'effective_from'],
  rate_tiers: ['utility_rate_id', 'lower_units', 'upper_units', 'price_per_unit'],
  meter_readings: ['tenancy_id', 'utility_type_id', 'reading_period', 'previous_reading', 'current_reading', 'recorded_by'],
  bills: ['tenancy_id', 'billing_month', 'rent_amount', 'water_amount', 'electricity_amount', 'late_fee', 'total_amount', 'due_date', 'status', 'late_fee_applied_at'],
  bill_items: ['bill_id', 'description', 'quantity', 'unit_price', 'amount'],
  payments: ['bill_id', 'amount', 'method', 'reference_no', 'received_by', 'paid_at'],
  account_invitations: ['tenant_id', 'email', 'token_hash', 'expires_at', 'accepted_at', 'created_by'],
  notifications: ['user_id', 'title', 'message', 'channel', 'is_read'],
  maintenance_tickets: ['tenancy_id', 'title', 'description', 'priority', 'status', 'created_by', 'updated_at', 'escalated_at'],
  ticket_status_history: ['ticket_id', 'status', 'changed_by', 'note'],
  audit_logs: ['actor_user_id', 'action', 'entity_type', 'entity_id', 'details'],
  email_outbox: ['recipient', 'subject', 'body', 'status'],
  system_settings: ['setting_key', 'setting_value'],
  room_amenities: ['name'],
  room_amenity_map: ['room_id', 'amenity_id'],
  reservation_events: ['reservation_id', 'event_type', 'note'],
  waitlist: ['tenant_id', 'room_id', 'status'],
  users: ['full_name', 'email', 'password_hash', 'role', 'is_active']
};

async function main() {
  const database = process.argv[2] || process.env.DB_NAME || 'dormease';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database
  });
  const [rows] = await connection.query(
    'SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?', [database]);
  const present = new Map();
  rows.forEach((r) => present.set(`${r.t}.${r.c}`));

  const [tables] = await connection.query(
    'SELECT TABLE_NAME AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE="BASE TABLE"', [database]);
  console.log(`${database}: ${tables.length} tables present`);
  const missing = Object.entries(EXPECTED)
    .filter(([t]) => tables.some((x) => x.n === t))
    .map(([t, cols]) => ({ table: t, columns: cols.filter((c) => !present.has(`${t}.${c}`)) }))
    .filter((entry) => entry.columns.length);
  const absentTables = Object.keys(EXPECTED).filter((t) => !tables.some((x) => x.n === t));
  console.log('tables missing entirely:', absentTables.join(', ') || 'none');
  console.log('columns missing on existing tables:');
  if (!missing.length) console.log('  none');
  missing.forEach(({ table, columns }) => console.log(`  ${table}: ${columns.join(', ')}`));

  console.log('rows (is there anything worth keeping?):');
  for (const table of ['users', 'houses', 'rooms', 'tenants', 'tenancies', 'bills', 'payments', 'reservation_requests', 'account_invitations']) {
    try {
      const [[{ n }]] = await connection.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
      console.log(`  ${table}: ${n}`);
    } catch {
      console.log(`  ${table}: (not readable)`);
    }
  }
  await connection.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
