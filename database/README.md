# Database scripts

MySQL 8.0.16 or newer (the scripts use `CREATE OR REPLACE VIEW`, `information_schema` guards and
`DELIMITER` blocks, so run them with the `mysql` command-line client or any tool that understands
`DELIMITER`).

The schema is split by member so each person authors their own tables. Apply
`database/schema/*.sql` in filename order, then `database/seed/*.sql` in filename order. Every file
is idempotent:

```bash
for file in schema/*.sql; do mysql -u root -p < "$file"; done
for file in seed/*.sql;   do mysql -u root -p < "$file"; done
```

Every fragment starts with `USE dormease;` and `01_core.sql` creates the database, so no schema has
to be selected on the command line.

| File | Owner | Tables / objects |
| --- | --- | --- |
| `schema/01_core.sql` | Member 1 | `users`, `staff_assignments`, `audit_logs`, `v_staff_house_scope` |
| `schema/02_properties.sql` | Member 2 | `houses`, `rooms`, `room_amenities`, `room_amenity_map` |
| `schema/03_tenants_leases.sql` | Member 3 | `tenants`, `reservations`, `waitlist`, `tenancies`, `reservation_events`, the two availability views |
| `schema/04_billing.sql` | Member 4 | 7 utility/billing tables and `tiered_utility_cost` |
| `schema/05_maintenance.sql` | Member 5 | tickets, history, notifications, outbox and the two ticket triggers |
| `schema/06_onboarding.sql` | Member 6 | `reservation_requests`, `account_invitations`, `system_settings` |
| `schema/99_integration.sql` | Member 1 | Cross-feature foreign keys and the guarded forward migration |
| `seed/00_core.sql` | Member 1 | Demo accounts |
| `seed/10_properties.sql` | Member 2 | Demo houses, rooms, amenities |
| `seed/15_staff.sql` | Member 1 | Demo staff assignments |
| `seed/20_tenants_leases.sql` | Member 3 | Demo tenants, lease, reservation |
| `seed/30_billing.sql` | Member 4 | Rates, tiers, readings, bill and items |
| `seed/40_maintenance.sql` | Member 5 | Notifications and tickets |
| `seed/50_onboarding.sql` | Member 6 | Settings and reservation requests |

`01_core.sql` creates the database if it does not exist yet and selects it; the other fragments
select it too, so they can be run in any order that respects the dependency list above.

## Loading without the mysql client

```bash
cd backend && npm install
npm run db:setup                      # loads every schema and seed fragment into DB_NAME
npm run db:setup -- --db dormease_test
npm run db:setup -- --skip-seed        # structure only
npm run db:setup -- --fresh            # drop the target database and rebuild it
```

`scripts/load-database.js` talks to MySQL through the app's own driver, splits the files
quote-aware, honours `DELIMITER //`, skips the `USE`/`CREATE DATABASE` lines and creates the target
schema itself. It applies `database/schema/*.sql` first, then `database/seed/*.sql`, both sorted by
filename, and reports what landed, e.g. `84 statements -> dormease: 26 tables, 3 views, 1 routine,
2 triggers`. On a partial branch, a seed fragment whose tables have not merged yet is skipped with
a message instead of failing the whole setup.

## Re-running against an older database

`CREATE TABLE IF NOT EXISTS` leaves pre-existing tables alone, so a database created from an earlier
version of this schema keeps whatever columns it had. `schema/99_integration.sql` therefore runs a
`dormease_forward_migrate` procedure that queries `information_schema` and adds each column created
since then (`staff_assignments.can_manage_rates`, `houses.description`, `houses.is_active`,
`rooms.photo_url`, `reservations.source`, `tenancies.occupants`, `maintenance_tickets.created_by`,
`maintenance_tickets.updated_at`) before dropping itself. Each check also requires the table to
exist, so a fragment that has not merged yet cannot break the branch. Without it, the availability
views in `03_tenants_leases.sql` fail on `Unknown column 'sa.can_manage_rates'`. The procedure is
guarded, so it is a no-op on a current database.

That covers new columns only. A key that changed *type* cannot be patched this way: the demo ids moved
from `INT UNSIGNED` to `BIGINT UNSIGNED`, and a table already holding the old type keeps it, so the
first new table with an inline foreign key to it fails with
`Referencing column 'user_id' and referenced column 'id' ... are incompatible`. `load-database.js`
compares the primary key type of every table the fragments create against the one already in the
target database, before executing anything, and names the drifted tables instead. Rebuild such a
database with `npm run db:setup -- --fresh`, which drops it first and refuses to run when
`NODE_ENV=production`.

## What the scripts add beyond a plain schema

| Object | Why it exists |
| --- | --- |
| `reservation_requests` | Visitors ask for a room without an account. Approval is what creates a tenant. |
| `account_invitations` | Single-use, expiring password invitations, stored as a sha256 hash. |
| `v_public_rooms` | The only room data a visitor can read: no tenant names, contacts or bills. |
| `v_room_availability` | Free beds per room, counting active leases and unexpired holds and honouring lease end dates. |
| `v_staff_house_scope` | Which houses a staff account may touch, and whether they may change utility rates. |
| `tiered_utility_cost(rate, units)` | Progressive water/electricity pricing, used by the billing engine. |
| `trg_ticket_escalation_once` | Stops the escalation job from charging a ticket twice. |
| `trg_ticket_history_on_insert` | Every ticket gets its first history row automatically. |

## Demo data

`seed/00_core.sql` writes three accounts that share the password `DormEase#2026`; the other seed
fragments add one demo row for each feature area:

- `landlord@example.com` — owns the two demo houses
- `staff@example.com` — assigned to both demo houses, with `can_manage_rates = TRUE` for house 1 and
  `FALSE` for house 2, so the per-assignment rate right is visible in the UI
- `tenant@example.com` — linked to tenant record 3 with an active lease, water and electricity
  readings, a bill with its itemised lines, and maintenance tickets

They are hashed with bcrypt cost 12 by `SET @demo_hash`. To use a different password:

```bash
cd backend && node scripts/hash.js "YourPassword"   # paste the output over @demo_hash in seed/00_core.sql
```

`INSERT IGNORE` keeps rows that already exist by primary key, which is what makes the seed
re-runnable — but it also means a database seeded from the placeholder version of this file would
keep the literal `REPLACE_WITH_BCRYPT_HASH` text and that account could never log in. The seed
repairs that itself:

```sql
UPDATE users SET password_hash=@demo_hash WHERE password_hash='REPLACE_WITH_BCRYPT_HASH';
UPDATE users SET is_active=TRUE WHERE email IN ('landlord@example.com','staff@example.com','tenant@example.com');
```

`scripts/check-demo-login.js` verifies all three logins by comparing the stored hashes against the
demo password and prints only yes/no; `--fix` rewrites them.

The three seeded `maintenance_tickets` deliberately cover `open`, `in_progress` and `escalated`, and
`trg_ticket_history_on_insert` supplies the matching history rows, so the ticket trail is visible
without hand-written data.

Never keep the demo accounts, or a seeded password hash, in a production database. Create the real
landlord through `POST /api/staff`-style provisioning or a one-off script, and delete the demo rows.
Deleting is not always possible: payments, readings and tickets reference those users with `RESTRICT`,
so on a database that has seen real activity, set `users.is_active = FALSE` instead.

`join_reports.sql` is a teaching file: read-only example queries (inner, left, right, anti-join and the
`UNION` trick that stands in for a full outer join). It is not part of the setup.
