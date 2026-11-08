USE dormease;
-- Member 4 — Utilities, meter readings, bills and payments.
CREATE TABLE IF NOT EXISTS utility_types (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL
);

CREATE TABLE IF NOT EXISTS utility_rates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  house_id BIGINT UNSIGNED NOT NULL,
  utility_type_id BIGINT UNSIGNED NOT NULL,
  fixed_charge DECIMAL(10,2) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL,
  KEY idx_rates_lookup(house_id, utility_type_id, effective_from),
  FOREIGN KEY (house_id) REFERENCES houses(id),
  FOREIGN KEY (utility_type_id) REFERENCES utility_types(id)
);

CREATE TABLE IF NOT EXISTS rate_tiers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utility_rate_id BIGINT UNSIGNED NOT NULL,
  lower_units DECIMAL(10,3) NOT NULL,
  upper_units DECIMAL(10,3) NULL,
  price_per_unit DECIMAL(10,4) NOT NULL,
  FOREIGN KEY (utility_rate_id) REFERENCES utility_rates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meter_readings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenancy_id BIGINT UNSIGNED NOT NULL,
  utility_type_id BIGINT UNSIGNED NOT NULL,
  reading_period DATE NOT NULL,
  previous_reading DECIMAL(12,3) NOT NULL,
  current_reading DECIMAL(12,3) NOT NULL,
  recorded_by BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_reading(tenancy_id, utility_type_id, reading_period),
  FOREIGN KEY (tenancy_id) REFERENCES tenancies(id),
  FOREIGN KEY (utility_type_id) REFERENCES utility_types(id),
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bills (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenancy_id BIGINT UNSIGNED NOT NULL,
  billing_month DATE NOT NULL,
  rent_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  water_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  electricity_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  late_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('unpaid','partial','paid','overdue','void') DEFAULT 'unpaid',
  late_fee_applied_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bill(tenancy_id, billing_month),
  KEY idx_bills_status_due(status, due_date),
  FOREIGN KEY (tenancy_id) REFERENCES tenancies(id)
);

CREATE TABLE IF NOT EXISTS bill_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(180) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,4) NOT NULL DEFAULT 0,
  amount DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method ENUM('cash','bank_transfer','e_wallet','other') DEFAULT 'cash',
  reference_no VARCHAR(100) NULL,
  received_by BIGINT UNSIGNED NOT NULL,
  paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_id) REFERENCES bills(id),
  FOREIGN KEY (received_by) REFERENCES users(id)
);

DROP FUNCTION IF EXISTS tiered_utility_cost;
DELIMITER //
CREATE FUNCTION tiered_utility_cost(p_rate_id BIGINT UNSIGNED, p_units DECIMAL(12,3))
RETURNS DECIMAL(12,2)
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_total DECIMAL(12,4) DEFAULT 0;
  DECLARE v_done INT DEFAULT 0;
  DECLARE v_low DECIMAL(12,3);
  DECLARE v_high DECIMAL(12,3);
  DECLARE v_price DECIMAL(10,4);
  DECLARE v_units DECIMAL(12,3);
  DECLARE tier_cursor CURSOR FOR
    SELECT lower_units, upper_units, price_per_unit
    FROM rate_tiers WHERE utility_rate_id=p_rate_id ORDER BY lower_units;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done=1;
  SET v_units=GREATEST(0,p_units);
  OPEN tier_cursor;
  read_loop: LOOP
    FETCH tier_cursor INTO v_low,v_high,v_price;
    IF v_done=1 OR v_units<=v_low THEN LEAVE read_loop; END IF;
    IF v_high IS NULL THEN
      SET v_total=v_total + (v_units-v_low)*v_price;
    ELSE
      SET v_total=v_total + (LEAST(v_units,v_high)-v_low)*v_price;
    END IF;
  END LOOP;
  CLOSE tier_cursor;
  RETURN ROUND(v_total,2);
END//
DELIMITER ;
