-- =========================================================================
-- DormEase: Realistic Demonstration Seed Data
-- =========================================================================

-- 1. Roles
INSERT OR IGNORE INTO roles (id, role_name, description) VALUES
(1, 'LANDLORD', 'Boarding house property owner and manager with full access'),
(2, 'STAFF', 'Dorm manager or caretaker who logs meter readings and accepts payments'),
(3, 'STUDENT_TENANT', 'Student boarder residing in a room');

-- 2. Users (passwords hashed or plain demo 'dormease123')
INSERT OR IGNORE INTO users (id, role_id, full_name, email, password_hash, phone, status) VALUES
(1, 1, 'Engr. Roberto Dela Cruz', 'roberto.landlord@dormease.ph', 'dormease123', '09171234567', 'ACTIVE'),
(2, 2, 'Maria Santos (Caretaker)', 'maria.caretaker@dormease.ph', 'dormease123', '09187654321', 'ACTIVE'),
(3, 3, 'Kenji Takahashi (CS Student)', 'kenji.takahashi@univ.edu.ph', 'dormease123', '09201112233', 'ACTIVE'),
(4, 3, 'Bea Alonzo (Nursing Student)', 'bea.alonzo@univ.edu.ph', 'dormease123', '09223334455', 'ACTIVE'),
(5, 3, 'David Tan (Engineering Student)', 'david.tan@univ.edu.ph', 'dormease123', '09195556677', 'ACTIVE'),
(6, 3, 'Alyssa Valdez (Student Lead)', 'alyssa.valdez@univ.edu.ph', 'dormease123', '09217778899', 'ACTIVE');

-- 3. Properties
INSERT OR IGNORE INTO properties (id, owner_id, property_name, address, contact_number, total_floors) VALUES
(1, 1, 'Green Ville Student Residence', '104 University Ave, Sampaloc, Manila', '0287654321', 3),
(2, 1, 'Sunrise Academic Dormitory', '45 P. Noval St, Espana, Manila', '0281239876', 2);

-- 4. Room Categories
INSERT OR IGNORE INTO room_categories (id, category_name, base_rate, max_occupants, description) VALUES
(1, 'Solo Studio Deluxe', 5500.00, 1, 'Private room with private ensuite bathroom and study desk'),
(2, 'Twin Shared Suite', 3500.00, 2, 'Two single beds, aircon, individual lockers and study desks'),
(3, 'Quadruple Bedspace', 2400.00, 4, 'Bunk bed accommodation for budget-conscious university students');

-- 5. Rooms
INSERT OR IGNORE INTO rooms (id, property_id, category_id, room_number, floor_number, aircon_equipped, status) VALUES
(1, 1, 1, 'Room 101', 1, 1, 'OCCUPIED'),
(2, 1, 2, 'Room 102', 1, 1, 'OCCUPIED'),
(3, 1, 2, 'Room 201', 2, 0, 'AVAILABLE'),
(4, 1, 3, 'Room 202', 2, 1, 'AVAILABLE'),
(5, 2, 1, 'Villa A-1', 1, 1, 'MAINTENANCE'),
(6, 2, 2, 'Villa B-2', 2, 1, 'AVAILABLE');

-- 6. Amenities
INSERT OR IGNORE INTO amenities (id, amenity_name, icon, is_free) VALUES
(1, 'High-Speed Fiber Wi-Fi (500Mbps)', 'fa-wifi', 1),
(2, 'Hot & Cold Shower', 'fa-shower', 1),
(3, 'Air Conditioning Unit', 'fa-snowflake', 1),
(4, 'Biometric Security Access', 'fa-fingerprint', 1),
(5, 'Common Study Lounge with Outlets', 'fa-book-reader', 1),
(6, 'Shared Kitchen Induction Stove', 'fa-utensils', 1);

-- 7. Room Amenity Mapping
INSERT OR IGNORE INTO room_amenities (room_id, amenity_id) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5),
(2, 1), (2, 3), (2, 4), (2, 5),
(3, 1), (3, 4), (3, 5), (3, 6),
(4, 1), (4, 4), (4, 6);

-- 8. Tenants
INSERT OR IGNORE INTO tenants (id, user_id, university_or_company, student_id_number, emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone) VALUES
(1, 3, 'National University Manila', '2023-10492-MN-0', 'Mrs. Linda Takahashi', '09178889900', 'Ken Takahashi', '09178889901'),
(2, 4, 'University of Santo Tomas', '2022-09412-UST', 'Dr. Arturo Alonzo', '09192223344', 'Elena Alonzo', '09192223345'),
(3, 5, 'Far Eastern University', '2024-55123-FEU', 'Grace Tan', '09204445566', 'William Tan', '09204445567');

-- 9. Reservations
INSERT OR IGNORE INTO reservations (id, room_id, tenant_id, reservation_date, preferred_move_in, deposit_amount, reservation_status, notes) VALUES
(1, 4, 3, '2026-10-15', '2026-11-05', 1000.00, 'CONFIRMED', 'Target move-in for upcoming 2nd semester finals review'),
(2, 3, 2, '2026-10-20', '2026-11-15', 500.00, 'PENDING', 'Requested lower bunk bed preference');

-- 10. Leases
INSERT OR IGNORE INTO leases (id, room_id, tenant_id, lease_start_date, lease_end_date, monthly_rent_amount, security_deposit, lease_status, check_in_date, check_out_date) VALUES
(1, 1, 1, '2026-06-01', '2027-05-31', 5500.00, 11000.00, 'ACTIVE', '2026-06-01', NULL),
(2, 2, 2, '2026-08-01', '2027-07-31', 3500.00, 7000.00, 'ACTIVE', '2026-08-01', NULL);

-- 11. Utility Meters
INSERT OR IGNORE INTO utility_meters (id, room_id, meter_type, meter_serial_number, initial_reading, is_active) VALUES
(1, 1, 'ELECTRICITY', 'MTR-ELEC-R101', 1240.50, 1),
(2, 1, 'WATER', 'MTR-WAT-R101', 450.00, 1),
(3, 2, 'ELECTRICITY', 'MTR-ELEC-R102', 2150.00, 1),
(4, 2, 'WATER', 'MTR-WAT-R102', 320.00, 1),
(5, 3, 'ELECTRICITY', 'MTR-ELEC-R201', 500.00, 1),
(6, 3, 'WATER', 'MTR-WAT-R201', 110.00, 1);

-- 12. Utility Rates (Tiered calculation rules!)
INSERT OR IGNORE INTO utility_rates (id, utility_type, tier1_limit, tier1_rate, tier2_rate, base_service_fee, late_penalty_percentage, effective_date) VALUES
(1, 'ELECTRICITY', 80.00, 12.50, 16.00, 50.00, 5.00, '2026-01-01'), -- Tier 1: <=80 kWh @ 12.50/kWh, Tier 2: >80 kWh @ 16.00/kWh surge rate
(2, 'WATER', 10.00, 35.00, 50.00, 30.00, 5.00, '2026-01-01');       -- Tier 1: <=10 cu.m @ 35.00/cu.m, Tier 2: >10 cu.m @ 50.00/cu.m

-- 13. Meter Readings (Demonstrating normal vs high consumption)
INSERT OR IGNORE INTO meter_readings (id, meter_id, previous_reading, current_reading, consumption_units, reading_date, billed_status, recorded_by) VALUES
(1, 1, 1240.50, 1345.50, 105.00, '2026-10-25', 'BILLED', 2), -- Electricity R101: 105 kWh consumed (Crossed 80 kWh Tier 1!)
(2, 2, 450.00, 458.50, 8.50, '2026-10-25', 'BILLED', 2),      -- Water R101: 8.5 cu.m consumed (Within Tier 1)
(3, 3, 2150.00, 2210.00, 60.00, '2026-10-25', 'BILLED', 2),   -- Electricity R102: 60 kWh consumed
(4, 4, 320.00, 332.00, 12.00, '2026-10-25', 'BILLED', 2);     -- Water R102: 12.00 cu.m consumed (Crossed 10 cu.m Tier 1!)

-- 14. Billing Invoices (Auto-itemized digital receipts)
INSERT OR IGNORE INTO billing_invoices (id, invoice_number, lease_id, reading_id_water, reading_id_electric, billing_period_start, billing_period_end, rent_charge, water_charge, electric_charge, penalty_charge, total_amount_due, payment_due_date, invoice_status) VALUES
(1, 'INV-202610-001', 1, 2, 1, '2026-10-01', '2026-10-31', 5500.00, 327.50, 1450.00, 0.00, 7277.50, '2026-11-05', 'PAID'),
(2, 'INV-202610-002', 2, 4, 3, '2026-10-01', '2026-10-31', 3500.00, 480.00, 800.00, 0.00, 4780.00, '2026-11-05', 'UNPAID');

-- 15. Payments (Digital Receipts)
INSERT OR IGNORE INTO payments (id, invoice_id, payment_amount, payment_date, payment_method, reference_code, receipt_number, verified_by, notes) VALUES
(1, 1, 7277.50, '2026-10-28', 'GCASH', 'GC-8947261901', 'RCPT-202610-001', 2, 'Settled in full via GCash payment confirmation');

-- 16. Audit Logs
INSERT OR IGNORE INTO audit_logs (id, user_id, action_type, entity_name, record_id, details) VALUES
(1, 2, 'METER_LOG', 'meter_readings', 1, 'Logged monthly electric reading 1345.50 kWh for Room 101'),
(2, 2, 'GENERATE_INVOICE', 'billing_invoices', 1, 'Auto-generated itemized billing statement INV-202610-001 for Lease 1'),
(3, 2, 'CONFIRM_PAYMENT', 'payments', 1, 'Verified GCash receipt RCPT-202610-001 amounting to PHP 7277.50');
