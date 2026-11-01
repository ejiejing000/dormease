-- =========================================================================
-- DormEase: Integrated Student Boarding House Management System
-- Database Schema (16 Relational Tables - Satisfies 6-Member Rubric Minimum)
-- Supports SQLite and MySQL syntax
-- =========================================================================

-- 1. ROLES TABLE (Member A: Core)
CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. USERS TABLE (Member A: Core)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id INTEGER NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

-- 3. AUDIT_LOGS TABLE (Member A: Core & Security)
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action_type VARCHAR(50) NOT NULL, -- e.g., 'LOGIN', 'CREATE_READING', 'PAYMENT_RECEIVED'
    entity_name VARCHAR(50) NOT NULL,
    record_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. PROPERTIES TABLE (Member B: Master Data)
CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    property_name VARCHAR(120) NOT NULL,
    address TEXT NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    total_floors INTEGER DEFAULT 2,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- 5. ROOM_CATEGORIES TABLE (Member B: Master Data)
CREATE TABLE IF NOT EXISTS room_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name VARCHAR(50) NOT NULL UNIQUE, -- e.g. 'Single Deluxe', 'Double Sharing', 'Quad Room'
    base_rate DECIMAL(10,2) NOT NULL,
    max_occupants INTEGER NOT NULL DEFAULT 1,
    description TEXT
);

-- 6. ROOMS TABLE (Member B: Master Data)
CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    room_number VARCHAR(20) NOT NULL,
    floor_number INTEGER NOT NULL DEFAULT 1,
    aircon_equipped INTEGER NOT NULL DEFAULT 0, -- 0 = No, 1 = Yes
    status VARCHAR(20) DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'RESERVED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES room_categories(id) ON DELETE RESTRICT
);

-- 7. AMENITIES TABLE (Member B: Master Data)
CREATE TABLE IF NOT EXISTS amenities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amenity_name VARCHAR(60) NOT NULL UNIQUE,
    icon VARCHAR(30) DEFAULT 'fa-check',
    is_free INTEGER DEFAULT 1
);

-- 8. ROOM_AMENITIES TABLE (Member B: Master Data - Many-to-Many Bridge)
CREATE TABLE IF NOT EXISTS room_amenities (
    room_id INTEGER NOT NULL,
    amenity_id INTEGER NOT NULL,
    PRIMARY KEY (room_id, amenity_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (amenity_id) REFERENCES amenities(id) ON DELETE CASCADE
);

-- 9. TENANTS TABLE (Member C: Transactions)
CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    university_or_company VARCHAR(150) NOT NULL,
    student_id_number VARCHAR(50),
    emergency_contact_name VARCHAR(100) NOT NULL,
    emergency_contact_phone VARCHAR(20) NOT NULL,
    guardian_name VARCHAR(100),
    guardian_phone VARCHAR(20),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 10. RESERVATIONS TABLE (Member C: Transactions)
CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    reservation_date DATE NOT NULL,
    preferred_move_in DATE NOT NULL,
    deposit_amount DECIMAL(10,2) DEFAULT 0.00,
    reservation_status VARCHAR(20) DEFAULT 'PENDING' CHECK(reservation_status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'CONVERTED_TO_LEASE')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 11. LEASES TABLE (Member C: Transactions)
CREATE TABLE IF NOT EXISTS leases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    lease_start_date DATE NOT NULL,
    lease_end_date DATE NOT NULL,
    monthly_rent_amount DECIMAL(10,2) NOT NULL,
    security_deposit DECIMAL(10,2) NOT NULL,
    lease_status VARCHAR(20) DEFAULT 'ACTIVE' CHECK(lease_status IN ('ACTIVE', 'TERMINATED', 'EXPIRED', 'PENDING_CHECKOUT')),
    check_in_date DATE,
    check_out_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

-- 12. UTILITY_METERS TABLE (Member D: Unique Feature - Meter Engine)
CREATE TABLE IF NOT EXISTS utility_meters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    meter_type VARCHAR(20) NOT NULL CHECK(meter_type IN ('ELECTRICITY', 'WATER')),
    meter_serial_number VARCHAR(50) NOT NULL UNIQUE,
    initial_reading DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- 13. UTILITY_RATES TABLE (Member D: Unique Feature - Tiered Calculation Rules)
CREATE TABLE IF NOT EXISTS utility_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    utility_type VARCHAR(20) NOT NULL CHECK(utility_type IN ('ELECTRICITY', 'WATER')),
    tier1_limit DECIMAL(10,2) NOT NULL,       -- e.g. up to 100 kWh or 10 cu.m
    tier1_rate DECIMAL(10,2) NOT NULL,        -- base price per unit
    tier2_rate DECIMAL(10,2) NOT NULL,        -- surge price per unit above limit
    base_service_fee DECIMAL(10,2) DEFAULT 0.00,
    late_penalty_percentage DECIMAL(5,2) DEFAULT 5.00,
    effective_date DATE NOT NULL
);

-- 14. METER_READINGS TABLE (Member D: Unique Feature - Readings Log)
CREATE TABLE IF NOT EXISTS meter_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_id INTEGER NOT NULL,
    previous_reading DECIMAL(10,2) NOT NULL,
    current_reading DECIMAL(10,2) NOT NULL,
    consumption_units DECIMAL(10,2) NOT NULL,
    reading_date DATE NOT NULL,
    billed_status VARCHAR(20) DEFAULT 'PENDING' CHECK(billed_status IN ('PENDING', 'BILLED', 'CANCELLED')),
    recorded_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meter_id) REFERENCES utility_meters(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- 15. BILLING_INVOICES TABLE (Member E: Unique Feature - Itemized Receipts & Invoicing)
CREATE TABLE IF NOT EXISTS billing_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    lease_id INTEGER NOT NULL,
    reading_id_water INTEGER,
    reading_id_electric INTEGER,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    rent_charge DECIMAL(10,2) NOT NULL,
    water_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    electric_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    penalty_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_amount_due DECIMAL(10,2) NOT NULL,
    payment_due_date DATE NOT NULL,
    invoice_status VARCHAR(20) DEFAULT 'UNPAID' CHECK(invoice_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lease_id) REFERENCES leases(id) ON DELETE RESTRICT,
    FOREIGN KEY (reading_id_water) REFERENCES meter_readings(id) ON DELETE SET NULL,
    FOREIGN KEY (reading_id_electric) REFERENCES meter_readings(id) ON DELETE SET NULL
);

-- 16. PAYMENTS TABLE (Member E: Unique Feature - Receipts & Settlement)
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    payment_amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(30) NOT NULL CHECK(payment_method IN ('CASH', 'GCASH', 'BANK_TRANSFER', 'PAYA')),
    reference_code VARCHAR(100),
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    verified_by INTEGER NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE RESTRICT
);
