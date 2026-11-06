-- Member 1 — Core platform: accounts, staff scoping and the audit trail.
-- Applied first. The staff_assignments -> houses foreign key is added by
-- 99_integration.sql because houses is a Member 2 table.
CREATE DATABASE IF NOT EXISTS dormease CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dormease;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('landlord','staff','tenant') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  house_id BIGINT UNSIGNED NOT NULL,
  can_manage_rates BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_staff_house(user_id, house_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_created(created_at),
  KEY idx_audit_entity(entity_type, entity_id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE OR REPLACE VIEW v_staff_house_scope AS
SELECT sa.user_id, sa.house_id, sa.can_manage_rates FROM staff_assignments sa;
