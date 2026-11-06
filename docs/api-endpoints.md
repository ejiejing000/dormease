# DORMEASE API endpoints

Base URL `http://localhost:9000/api`. Every response is JSON in the shape
`{ "success": true, "data": ... }` or `{ "success": false, "message": "..." }`.
Authenticated calls need `Authorization: Bearer <token>` from `POST /auth/login`.

"Who" is the role the server accepts, taken from the `users` row behind the token — never from the
request body. A staff account additionally needs a `staff_assignments` row for that house; a tenant
additionally needs to own the record. An out-of-scope id is answered with **404**, not 403, so ids
cannot be probed.

## 1. Public area (no token)

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/public/rooms` | visitor | Browse listed rooms. Filters: `houseId`, `minRent`, `maxRent`, `coolingType`, `availableOnly`, `q`, `sort` (`price_asc`, `price_desc`, `newest`), `page`, `perPage` |
| GET | `/public/rooms/:id` | visitor | One room, plus interest in the last 30 days |
| GET | `/public/houses` | visitor | House names/addresses and the rent range for the filter bar |
| POST | `/public/reservation-requests` | visitor | Ask for a room: `full_name`, `email`, `phone`, `room_id`, `preferred_move_in_date`, `message`. Rate limited to 15/hour/IP. Creates a **request**, not a tenant or a bill |
| GET | `/public/reservation-requests/status?id=&email=` | visitor | Track that request. Both id and the matching email are required |

`/public/rooms*` reads the `v_public_rooms` view, so tenant names, contacts, bills and internal fields
are not reachable even if the code changed.

## 2. Accounts

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login` | anyone with credentials | `email` + `password` only. Returns `{ token, user: { id, full_name, email, role, houseIds, tenantId, dashboard } }`. `dashboard` is what the browser navigates to. 10 attempts / 15 min |
| GET | `/auth/me` | signed in | Current account, scope and linked tenant record |
| POST | `/auth/change-password` | signed in | `current_password`, `new_password` (10+ characters) |
| POST | `/auth/logout` | signed in | Audit-records the sign-out; the JWT itself stays valid until it expires |

There is no registration endpoint at all, and no endpoint accepts a `role` from a client.

## 2a. Tenant invitations

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/invitations/:token` | visitor holding a link | Shows who the invitation is for and when it expires, before any password is typed |
| POST | `/invitations/accept` | visitor holding a link | `{ token, password }` — creates the tenant login, marks the token used, and returns a session. This is the only path to a new password; a used or expired token gives 404 |
| GET | `/invitations?status=&tenantId=` | L, S | Invitation register with `pending` / `accepted` / `expired` status |
| POST | `/invitations` | L, S | `{ tenant_id, email? }` — issue a new single-use link and return `invitation_url` once |
| PATCH | `/invitations/:id/revoke` | L, S | Expire a pending invitation immediately |
| DELETE | `/invitations/:id` | L, S | Remove a pending invitation row; accepted invitations are kept as history |
| GET | `/invitations/coverage` | L, S | LEFT JOIN report: tenants with their invitation and account counts, including tenants with none |

## 3. Reservation requests and reservations (landlord, staff)

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/reservation-requests?status=` | L, S | Queue, pending first, limited to the houses they own or are assigned to |
| GET | `/reservation-requests/:id` | L, S | Full applicant details |
| POST | `/reservation-requests/:id/approve` | L, S | One transaction: `{ start_tenancy, move_in_date, occupants, note, send_invite }` → tenant record + approved reservation + optional active lease + expiring single-use invitation. `invitation_url` is returned once |
| POST | `/reservation-requests/:id/reject` | L, S | `{ note }` |
| GET | `/reservations?status=&roomId=` | L, S, tenant (own rows) | Reservations with room, house and hold expiry |
| GET | `/reservations/:id` | L, S, tenant (own rows) | Plus the event timeline |
| POST | `/reservations` | L, S | `{ tenant_id, room_id, start_date, hold }` for a walk-in booking |
| POST | `/reservations/:id/approve` / `/reject` / `/hold` | L, S | `hold` reserves the bed for `HOLD_MINUTES` |
| POST | `/reservations/:id/cancel` | L, S, tenant | A tenant may cancel only their own reservation (ownership re-checked) |
| GET | `/waitlist` | signed in | Waiting lists |
| POST | `/waitlist` | signed in | `{ tenant_id, room_id }` |
| PATCH | `/waitlist/:id` | L, S | `{ status }` |

## 4. Properties (landlord, staff)

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/houses` | L, S | Own/assigned houses with room and lease counts |
| GET | `/houses/:id` | L, S | One house |
| POST | `/houses` | L | `{ name, address, description }` |
| PATCH | `/houses/:id` | L | Rename, describe, activate/deactivate |
| DELETE | `/houses/:id` | L | Soft delete: deactivates the house and hides its rooms, keeping all history |
| GET | `/rooms?houseId=&status=` | L, S | Management view: free beds, active leases, listing flag |
| GET | `/rooms/vacancy-report?houseId=` | L, S | RIGHT JOIN report: rooms with no active lease that are still listed |
| POST | `/rooms` | L, S | `{ house_id, room_number, monthly_rent, bed_capacity, cooling_type, amenities, photo_url, storage_available, is_listed }` |
| GET | `/rooms/:id` | L, S | One room |
| PATCH | `/rooms/:id` | L, S | Any editable column; `house_id` cannot be moved |
| POST | `/rooms/:id/listing` | L, S | `{ is_listed }` — hide from or show on the public site without deleting history |
| DELETE | `/rooms/:id` | L, S | Hard delete only when the room has no lease, reservation, request or waitlist history; otherwise 409 |

## 5. Tenants and leases (landlord, staff)

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/tenants?q=&hasAccount=` | L, S | Official tenant records, with account status and active lease count |
| GET | `/tenants/:id` | L, S | Tenant with their leases (invitations live under `/invitations`) |
| POST | `/tenants` | L, S | Record only, no login |
| PATCH | `/tenants/:id` | L, S | Contact details |
| DELETE | `/tenants/:id` | L, S | Delete only when there is no lease, reservation, waitlist row or login account; otherwise 409 |
| GET | `/tenancies?status=&tenantId=` | L, S, tenant (own rows) | Leases with tenant, room, house, rent and bill count |
| GET | `/tenancies/register?houseId=&status=&from=&to=` | L, S, tenant (own rows) | INNER JOIN report across leases, tenants, rooms and houses with monthly value |
| GET | `/tenancies/:id` | L, S, tenant (own rows) | Plus the roommate list |
| POST | `/tenancies` | L, S | `{ tenant_id, room_id, start_date, occupants }`, rejected at 409 if the room is full |
| PATCH | `/tenancies/:id` | L, S | `end_date`, `occupants` |
| POST | `/tenancies/:id/end` | L, S | Ends the lease, `end_date` optional (defaults to today) |

## 6. Utilities and billing

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/rates?houseId=&utilityCode=` | L, S | Rates with tier counts |
| GET | `/rates/types` | L, S | `WATER`, `POWER` |
| GET | `/rates/:id` | L, S | Rate with its tiers |
| POST | `/rates` | L, S with `can_manage_rates` | `{ house_id, utility_code, fixed_charge, effective_from, tiers[] }` |
| POST | `/rates/:id/tiers` | L, S with `can_manage_rates` | `{ lower_units, upper_units, price_per_unit }` |
| GET | `/readings?houseId=&tenancyId=&period=` | L, S | Readings with computed `units_used` |
| POST | `/readings` | L, S | `{ tenancy_id, utility_code, reading_period, current_reading, previous_reading }`; the previous value defaults to the last reading and a decreasing reading is refused |
| POST | `/bill-preview` | L, S, tenant | Runs the billing engine without writing: rent (per bed, prorated), tiered water and electricity shares split between roommates |
| GET | `/bills?month=&status=&houseId=` | L, S, tenant (own rows) | Bills with `paid_amount` |
| GET | `/bills/ledger?month=&status=&houseId=` | L, S, tenant (own rows) | FULL OUTER JOIN report (LEFT JOIN + RIGHT JOIN branch) of bills and payments, including unmatched rows |
| GET | `/bills/:id` | L, S, tenant (own rows) | Bill plus its itemised lines |
| POST | `/bills/generate` | L, S | `{ tenancy_id, billing_month, due_date \| due_day_of_month, water_units, electricity_units, occupied_days }`; re-running replaces an unpaid bill instead of duplicating it |
| POST | `/bills/generate-all` | L, S | `{ billing_month, house_id? }` for every active lease in scope |
| PATCH | `/bills/:id` | L, S | Adjust rent/water/electricity/late fee/due date; the total is recalculated. Paid and void bills are refused |
| POST | `/bills/:id/void` | L, S | `{ reason }` — keeps the money already received |
| DELETE | `/bills/:id` | L, S | Delete an unpaid, unrecorded bill; a bill with payments must be voided instead |
| GET | `/payments?billId=` | L, S, tenant (own rows) | Payment history |
| POST | `/payments` | L, S | `{ bill_id, amount, method, reference_no, paid_at }`; refuses more than the outstanding balance and moves the bill to `partial`/`paid` |
| GET | `/payments/:id` | L, S, tenant (own rows) | One payment |
| GET | `/payments/:id/receipt` | L, S, tenant (own rows) | Receipt with the bill's line items and every payment on it |

## 7. Tickets, messages, reports, staff, audit

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/tickets?status=&open=` | L, S, tenant (own rows) | Escalated and open first |
| GET | `/tickets/history-report?status=` | L, S | LEFT JOIN report: every ticket with all of its status changes, including tickets with none |
| GET | `/tickets/:id` | L, S, tenant (own rows) | Ticket with its status history |
| POST | `/tickets` | L, S, tenant | `{ tenancy_id?, title, description, priority }`; a tenant may omit `tenancy_id` and their active lease is used |
| PATCH | `/tickets/:id` | L, S, tenant (own ticket) | `{ title, description, priority }` |
| PATCH | `/tickets/:id/status` | L, S | `{ status, note }` — one history row per change |
| DELETE | `/tickets/:id` | L, S | Delete a ticket; its status history is removed by the foreign key cascade |
| GET | `/notifications` | signed in | Own messages: `{ unread, items }` |
| POST | `/notifications` | L, S | Announce to one user account (staff only within their houses) |
| PATCH | `/notifications/:id/read` | signed in | Own messages only |
| PATCH | `/notifications/all/read` | signed in | Mark everything read |
| DELETE | `/notifications/read` | signed in | Delete all read messages |
| DELETE | `/notifications/:id` | signed in | Delete one of your own messages |
| GET | `/reports` | L, S | Summary, occupancy and collections in one call |
| GET | `/reports/summary` / `/occupancy` / `/collections` / `/income?months=` | L, S | Same figures split per report |
| GET | `/reports/tenants/:tenantId` | L, S | One tenant's leases, bills and balances |
| GET | `/staff` | L, S | Staff accounts with house assignments (staff see only themselves) |
| GET | `/staff/coverage` | L | LEFT JOIN report: every staff account with its house coverage, including unassigned staff |
| GET | `/staff/:id` | L | One staff account with its assignments |
| POST | `/staff` | L | `{ full_name, email, house_ids, can_manage_rates, password? }` — without a password a temporary one is generated, returned once and emailed |
| PATCH | `/staff/:id` | L | Update name, email or active flag |
| DELETE | `/staff/:id` | L | Deactivate the staff account (soft delete) |
| PUT | `/staff/:id/houses` | L | `{ house_ids, can_manage_rates }` replaces the assignment set |
| POST | `/staff/:id/password` | L | Reset a staff password |
| POST | `/staff/:id/deactivate` | L | Blocks the next request and any new sign-in |
| GET | `/audit-logs?entityType=&action=&actorId=&limit=` | L | Read-only history, including writes made by the background jobs |

## 8. Errors

| Status | Meaning |
| --- | --- |
| 400 | Validation failed; `message` names the field |
| 401 | Missing, malformed, expired or wrong-algorithm token, or the account is deactivated |
| 403 | Correctly signed in, but the role or the per-assignment right does not allow it |
| 404 | The record does not exist **or** belongs to a house/tenant outside your scope |
| 409 | Duplicate or impossible state (room at capacity, invitation already used, paying a void or already-paid bill) |
| 429 | Rate limit reached: 10 / 15 min for login and invitation acceptance, 15 / hour for a visitor submitting a request, 300 / 15 min across `/api` |
| 500 | Unexpected; the message is only exposed outside production |

## 9. Background jobs

Started by `npm start` (`src/jobs/index.js`), each with its own cron expression and all safe to re-run:
hold expiry, overdue bills (adds the late fee once per bill), ticket escalation (once per ticket), and
`email_outbox` delivery. Emails are queued inside the same transaction as the change that produced
them, so a failed transaction never sends a message.
