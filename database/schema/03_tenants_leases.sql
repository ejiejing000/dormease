USE dormease;
-- Member 3 — Tenants, reservations, leases and the availability views.
CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(40) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tenants_email(email),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  status ENUM('held','pending','approved','rejected','expired','cancelled') NOT NULL DEFAULT 'pending',
  source ENUM('guest_request','staff_created') NOT NULL DEFAULT 'staff_created',
  hold_expires_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reservations_room_status(room_id, status),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS waitlist (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  status ENUM('waiting','notified','fulfilled','cancelled') DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS tenancies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  status ENUM('active','ended') DEFAULT 'active',
  occupants INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tenancies_room_status(room_id, status),
  KEY idx_tenancies_tenant(tenant_id, status),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS reservation_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

CREATE OR REPLACE VIEW v_room_availability AS
SELECT r.id AS room_id, r.house_id, r.room_number, r.bed_capacity,
       GREATEST(0, r.bed_capacity -
         (SELECT COUNT(*) FROM tenancies t WHERE t.room_id=r.id AND t.status='active'
            AND (t.end_date IS NULL OR t.end_date >= CURDATE()))
         - (SELECT COUNT(*) FROM reservations rs WHERE rs.room_id=r.id AND rs.status='held'
              AND rs.hold_expires_at > NOW())) AS available_beds
FROM rooms r;

-- Public-facing projection: never carries tenant, billing or internal management columns.
CREATE OR REPLACE VIEW v_public_rooms AS
SELECT r.id, r.room_number, r.monthly_rent, r.bed_capacity, r.cooling_type,
       r.storage_available, r.amenities, r.photo_url,
       h.id AS house_id, h.name AS house_name, h.address AS house_address,
       v.available_beds,
       (v.available_beds > 0) AS is_available
FROM rooms r
JOIN houses h ON h.id=r.house_id
JOIN v_room_availability v ON v.room_id=r.id
WHERE r.is_listed=TRUE AND h.is_active=TRUE;
