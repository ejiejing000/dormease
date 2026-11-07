USE dormease;

INSERT IGNORE INTO system_settings(setting_key,setting_value) VALUES
 ('hold_minutes','30'),('ticket_sla_hours','48'),('late_fee_amount','100.00');

INSERT IGNORE INTO reservation_requests(id,room_id,full_name,email,phone,preferred_move_in_date,message,status) VALUES
 (1,3,'Sample Visitor','visitor@example.com','0918-000-0001',DATE_ADD(@month,INTERVAL 1 MONTH),'I am a second-year student looking for a room near campus.','pending'),
 (2,2,'Another Visitor','visitor2@example.com','0918-000-0002',@month,'Prefer an air-conditioned single room.','pending');
