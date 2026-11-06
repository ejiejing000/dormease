USE dormease;

-- Applied after 10_properties.sql. The JOIN makes the houses dependency explicit so the loader
-- skips this fragment on a branch where Member 2 has not merged yet.
INSERT IGNORE INTO staff_assignments(user_id, house_id, can_manage_rates)
SELECT u.id, h.id, demo.can_manage_rates
FROM (
  SELECT 'staff@example.com' AS email, 1 AS house_id, TRUE AS can_manage_rates
  UNION ALL SELECT 'staff@example.com', 2, FALSE
) AS demo
JOIN users u ON u.email = demo.email
JOIN houses h ON h.id = demo.house_id;
