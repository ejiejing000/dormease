USE dormease;

INSERT IGNORE INTO tenants(id,user_id,full_name,email,phone) VALUES
 (3,3,'Maria Santos','tenant@example.com','0917-000-0003'),
 (4,NULL,'Juan Dela Cruz','juan.delacruz@example.com','0917-000-0004');

INSERT IGNORE INTO tenancies(id,tenant_id,room_id,start_date,status,occupants) VALUES
 (3,3,1,@month,'active',1),
 (4,4,4,DATE_SUB(@month,INTERVAL 2 MONTH),'ended',1);
UPDATE tenancies SET end_date=DATE_SUB(@month,INTERVAL 1 DAY) WHERE id=4;

INSERT IGNORE INTO reservations(id,tenant_id,room_id,start_date,status,source,hold_expires_at) VALUES
 (1,3,1,@month,'approved','staff_created',NULL);
