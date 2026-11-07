USE dormease;
-- Member 2 — Property master data: houses, rooms and amenities.
CREATE TABLE IF NOT EXISTS houses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(255) NOT NULL,
  description TEXT NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_house_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  house_id BIGINT UNSIGNED NOT NULL,
  room_number VARCHAR(30) NOT NULL,
  monthly_rent DECIMAL(10,2) NOT NULL,
  bed_capacity INT NOT NULL DEFAULT 1,
  cooling_type ENUM('fan','aircon','none') DEFAULT 'fan',
  storage_available BOOLEAN DEFAULT FALSE,
  amenities JSON NULL,
  photo_url VARCHAR(500) NULL,
  is_listed BOOLEAN DEFAULT TRUE,
  UNIQUE KEY uq_room(house_id, room_number),
  KEY idx_rooms_listed(house_id, is_listed),
  KEY idx_rooms_rent(monthly_rent),
  FOREIGN KEY (house_id) REFERENCES houses(id)
);

CREATE TABLE IF NOT EXISTS room_amenities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS room_amenity_map (
  room_id BIGINT UNSIGNED NOT NULL,
  amenity_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY(room_id, amenity_id),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (amenity_id) REFERENCES room_amenities(id) ON DELETE CASCADE
);
