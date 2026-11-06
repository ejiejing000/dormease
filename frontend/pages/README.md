# Management and account pages

These pages sit behind a signed-in session. Nothing here is a security control: the API re-checks the
role from the JWT, the staff house assignments and tenant ownership on every request. Hiding a link or a
button is only convenience.

## How a page is written

`js/api.js` (session + fetch helper), `js/nav.js` (role-aware navbar, sign out) and `js/ui.js`
(`initPage(config)`) are shared. A page supplies a config: `endpoint`, `columns`, `filters`, optional
`fields` for the create form, and `rowActions` for the buttons on each row. Copy `_template.html`.

Row actions may send extra values with `body: (row) => ({...})`, ask for input with
`fields: [{name, label, type}]`, and render a detail panel with `render: (result) => html` (the panel is
the `#panel` section above the table).

## Pages

| Page | Roles | API |
| --- | --- | --- |
| `login.html` | everyone | `POST /api/auth/login` |
| `set-password.html` | invited tenant | `GET /api/invitations/:token`, `POST /api/invitations/accept` |
| `dashboard.html` | landlord, staff | `/api/reports/summary`, `/reservation-requests`, `/tickets` |
| `tenant-dashboard.html` | tenant | `/api/tenancies`, `/bills`, `/tickets`, `/notifications` |
| `reservation-requests.html` | landlord, staff | `/api/reservation-requests/:id/approve`, `/reject` |
| `reservations.html` | landlord, staff | `/api/reservations` |
| `houses.html` | landlord | `/api/houses` |
| `rooms.html` | landlord, staff | `/api/rooms` |
| `tenants.html` | landlord, staff | `/api/tenants`, `/api/invitations` |
| `invitations.html` | landlord, staff | `/api/invitations` (list, issue, revoke, delete) |
| `lease.html` | landlord, staff, tenant | `/api/tenancies` |
| `rates.html` | landlord, staff (per assignment) | `/api/rates` |
| `readings.html` | landlord, staff | `/api/readings` |
| `bills.html` | landlord, staff, tenant | `/api/bills`, `/api/bill-preview` |
| `payments.html` | landlord, staff, tenant | `/api/payments` |
| `tickets.html` | landlord, staff, tenant | `/api/tickets` |
| `notifications.html` | landlord, staff, tenant | `/api/notifications` |
| `reports.html` | landlord, staff | `/api/reports` |
| `audit.html` | landlord | `/api/audit-logs` |
| `staff.html` | landlord | `/api/staff` |

## There is deliberately no registration page

Public sign-up was removed (`register.html` no longer exists) because a self-service form would let a
tenant declare themselves a landlord. Accounts are provisioned: the system owner creates the landlord,
a landlord creates staff, and landlord/staff create tenants either through `tenants.html` or by approving
a reservation request. Approval produces a single-use, expiring invitation token; the tenant sets their
own password on `set-password.html`.

## Where to edit the shared behaviour

- Session, `api()`, money/date formatting, HTML escaping: `../js/api.js`
- Navigation and sign out: `../js/nav.js`
- Table/filter/create rendering: `../js/ui.js`
- Visitor pages (browse, room detail, request status): `../js/public.js`, in the folder above
