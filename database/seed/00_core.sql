USE dormease;

-- Demo password for every seeded account: DormEase#2026
-- Regenerate with `node scripts/hash.js "YourPassword"` and replace the hash below before any real deployment.
SET @demo_hash = '$2a$12$URFJ7jI41H/iGe1xyCvU0eT1F3.FUSq1tPd01Hrbm5SqB7mL/9vTy';
SET @month = DATE_FORMAT(CURDATE(), '%Y-%m-01');

INSERT IGNORE INTO users(id,full_name,email,password_hash,role) VALUES
 (1,'Demo Landlord','landlord@example.com',@demo_hash,'landlord'),
 (2,'Demo Staff','staff@example.com',@demo_hash,'staff'),
 (3,'Maria Santos','tenant@example.com',@demo_hash,'tenant');

-- A database seeded from the earlier placeholder version keeps its existing rows (INSERT IGNORE),
-- so any account still holding the literal placeholder is repaired to the demo password here.
UPDATE users SET password_hash=@demo_hash WHERE password_hash='REPLACE_WITH_BCRYPT_HASH';
UPDATE users SET is_active=TRUE WHERE email IN ('landlord@example.com','staff@example.com','tenant@example.com');
