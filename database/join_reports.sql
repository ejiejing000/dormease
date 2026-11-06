USE dormease;

-- The reviewer asks for six join reports, each served by a GET endpoint whose SQL lives in the
-- model layer. These are the same queries, written here so they can be pasted into MySQL Workbench
-- during the defense. Placeholders (:houseId, :month, ...) stand in for the query-string filters.

-- 1. INNER JOIN -------------------------------------------------------------- GET /api/tenancies/register
-- Every lease with the tenant, room and house it connects. A lease missing any of those rows
-- cannot exist because of the foreign keys, so INNER JOIN is the correct shape.
SELECT tn.id AS tenancy_id, te.full_name AS tenant_name, r.room_number,
       h.name AS house_name, tn.start_date, tn.status, tn.occupants,
       r.monthly_rent, (r.monthly_rent * tn.occupants) AS monthly_value
FROM tenancies tn
INNER JOIN tenants te ON te.id = tn.tenant_id
INNER JOIN rooms r ON r.id = tn.room_id
INNER JOIN houses h ON h.id = r.house_id
ORDER BY h.name, r.room_number, te.full_name;

-- 2. LEFT JOIN --------------------------------------------------------------- GET /api/invitations/coverage
-- Every tenant stays in the result even when they have never been invited or have no account,
-- which is exactly the onboarding gap the report is meant to expose.
SELECT t.id AS tenant_id, t.full_name, t.email,
       u.id AS account_user_id, u.is_active AS account_active,
       COUNT(i.id) AS invitations,
       COALESCE(SUM(i.accepted_at IS NOT NULL), 0) AS accepted,
       MAX(i.created_at) AS last_invitation_at
FROM tenants t
LEFT JOIN account_invitations i ON i.tenant_id = t.id
LEFT JOIN users u ON u.id = t.user_id
GROUP BY t.id, t.full_name, t.email, u.id, u.is_active
ORDER BY invitations, t.full_name;

-- 3. RIGHT JOIN -------------------------------------------------------------- GET /api/rooms/vacancy-report
-- The RIGHT JOIN keeps every room, and the WHERE clause drops the rooms that do have an active
-- lease, leaving the vacant listed rooms. The view supplies the live bed count.
SELECT h.name AS house_name, r.id AS room_id, r.room_number, r.bed_capacity,
       v.available_beds, (v.available_beds > 0) AS is_available
FROM tenancies tn
RIGHT JOIN rooms r ON r.id = tn.room_id AND tn.status = 'active'
JOIN houses h ON h.id = r.house_id
JOIN v_room_availability v ON v.room_id = r.id
WHERE tn.id IS NULL AND r.is_listed = TRUE
ORDER BY h.name, r.room_number;

-- 4. LEFT JOIN (history) ---------------------------------------------------- GET /api/tickets/history-report
-- A ticket with no history row still appears; the LEFT JOIN makes "never touched" visible.
SELECT mt.id AS ticket_id, mt.title, mt.priority, mt.status,
       te.full_name AS tenant_name, r.room_number, h.name AS house_name,
       sh.id AS history_id, sh.status AS history_status, sh.note,
       sh.created_at AS changed_at, cu.full_name AS changed_by_name
FROM maintenance_tickets mt
INNER JOIN tenancies tn ON tn.id = mt.tenancy_id
INNER JOIN tenants te ON te.id = tn.tenant_id
INNER JOIN rooms r ON r.id = tn.room_id
INNER JOIN houses h ON h.id = r.house_id
LEFT JOIN ticket_status_history sh ON sh.ticket_id = mt.id
LEFT JOIN users cu ON cu.id = sh.changed_by
ORDER BY mt.id DESC, sh.id;

-- 5. LEFT JOIN (staff) ------------------------------------------------------- GET /api/staff/coverage
-- Staff with no house assignment are still listed, so the landlord can spot unassigned accounts.
SELECT u.id, u.full_name, u.email, u.is_active,
       COUNT(sa.house_id) AS houses,
       GROUP_CONCAT(h.name ORDER BY h.name SEPARATOR ', ') AS house_names,
       MIN(sa.can_manage_rates) AS can_manage_rates
FROM users u
LEFT JOIN staff_assignments sa ON sa.user_id = u.id
LEFT JOIN houses h ON h.id = sa.house_id
WHERE u.role = 'staff'
GROUP BY u.id
ORDER BY u.id;

-- 6. FULL OUTER JOIN emulation ---------------------------------------------- GET /api/bills/ledger
-- MySQL 8 has no FULL OUTER JOIN. The LEFT branch returns every bill and its payment (if any);
-- the UNION ALL branch adds payments whose bill row is missing. match_type names each case.
SELECT b.id AS bill_id, b.billing_month, b.total_amount, p.id AS payment_id, p.amount,
       p.method, p.paid_at,
       CASE WHEN p.id IS NULL THEN 'bill_only' ELSE 'matched' END AS match_type
FROM bills b
INNER JOIN tenancies tn ON tn.id = b.tenancy_id
INNER JOIN tenants te ON te.id = tn.tenant_id
INNER JOIN rooms r ON r.id = tn.room_id
INNER JOIN houses h ON h.id = r.house_id
LEFT JOIN payments p ON p.bill_id = b.id

UNION ALL

SELECT b.id AS bill_id, b.billing_month, b.total_amount, p.id AS payment_id, p.amount,
       p.method, p.paid_at, 'payment_only' AS match_type
FROM bills b
RIGHT JOIN payments p ON p.bill_id = b.id
LEFT JOIN tenancies tn ON tn.id = b.tenancy_id
LEFT JOIN rooms r ON r.id = tn.room_id
LEFT JOIN houses h ON h.id = r.house_id
WHERE b.id IS NULL
ORDER BY bill_id;
