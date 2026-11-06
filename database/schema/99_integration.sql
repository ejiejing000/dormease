USE dormease;
-- Member 1 — Integration guards applied after every feature fragment.
-- Adds cross-feature foreign keys and brings an older database forward. Every
-- check is against information_schema so re-running setup is always safe and a
-- fragment that has not merged yet does not break the branch.
DROP PROCEDURE IF EXISTS dormease_forward_migrate;
DELIMITER //
CREATE PROCEDURE dormease_forward_migrate()
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'staff_assignments') > 0
     AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'staff_assignments' AND COLUMN_NAME = 'can_manage_rates') = 0 THEN
    ALTER TABLE staff_assignments ADD COLUMN can_manage_rates BOOLEAN NOT NULL DEFAULT TRUE AFTER house_id;
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'houses') > 0
     AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'houses' AND COLUMN_NAME = 'description') = 0 THEN
    ALTER TABLE houses ADD COLUMN description TEXT NULL AFTER address;
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'houses') > 0
     AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'houses' AND COLUMN_NAME = 'is_active') = 0 THEN
    ALTER TABLE houses ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER owner_user_id;
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'rooms') > 0
     AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'rooms' AND COLUMN_NAME = 'photo_url') = 0 THEN
    ALTER TABLE rooms ADD COLUMN photo_url VARCHAR(500) NULL AFTER amenities;
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'reservations') > 0
     AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'source') = 0 THEN
    ALTER TABLE reservations ADD COLUMN source ENUM('guest_request','staff_created') NOT NULL DEFAULT 'staff_created' AFTER status;
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tenancies') > 0
     AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tenancies' AND COLUMN_NAME = 'occupants') = 0 THEN
    ALTER TABLE tenancies ADD COLUMN occupants INT NOT NULL DEFAULT 1 AFTER status;
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'maintenance_tickets') > 0
     AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'maintenance_tickets' AND COLUMN_NAME = 'created_by') = 0 THEN
    ALTER TABLE maintenance_tickets ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER priority;
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'maintenance_tickets') > 0
     AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'maintenance_tickets' AND COLUMN_NAME = 'updated_at') = 0 THEN
    ALTER TABLE maintenance_tickets ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;
  END IF;
END//
DELIMITER ;
CALL dormease_forward_migrate();
DROP PROCEDURE dormease_forward_migrate;

-- staff_assignments.house_id -> houses.id, added only when both tables exist.
SET @staff_exists = (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_assignments');
SET @houses_exists = (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'houses');
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_assignments' AND CONSTRAINT_NAME = 'fk_staff_house');
SET @fk_sql = IF(@staff_exists = 0 OR @houses_exists = 0 OR @fk_exists > 0, 'DO 0',
  'ALTER TABLE staff_assignments ADD CONSTRAINT fk_staff_house FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- houses.owner_user_id -> users.id, for databases created before the constraint was inline.
SET @users_exists = (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users');
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'houses' AND CONSTRAINT_NAME = 'fk_house_owner');
SET @fk_sql = IF(@houses_exists = 0 OR @users_exists = 0 OR @fk_exists > 0, 'DO 0',
  'ALTER TABLE houses ADD CONSTRAINT fk_house_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- reservation_requests.created_reservation_id -> reservations.id, added when both exist.
SET @requests_exists = (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservation_requests');
SET @reservations_exists = (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations');
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'reservation_requests' AND CONSTRAINT_NAME = 'fk_request_reservation');
SET @fk_sql = IF(@requests_exists = 0 OR @reservations_exists = 0 OR @fk_exists > 0, 'DO 0',
  'ALTER TABLE reservation_requests ADD CONSTRAINT fk_request_reservation FOREIGN KEY (created_reservation_id) REFERENCES reservations(id) ON DELETE SET NULL');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
