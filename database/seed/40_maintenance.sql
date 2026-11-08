USE dormease;

INSERT IGNORE INTO notifications(user_id,title,message,channel) VALUES
 (3,'Bill available',CONCAT('Your bill for ',DATE_FORMAT(@month,'%M %Y'),' is ready. Due on the 11th.',''),'in_app'),
 (1,'New reservation request','Sample Visitor requested room 201 at Demo Boarding House.','in_app');

-- Maintenance tickets. trg_ticket_history_on_insert writes the first status-history row for each
-- of these, so the demo shows a full trail without inserting history by hand.
INSERT IGNORE INTO maintenance_tickets(id,tenancy_id,title,description,priority,status,created_by,escalated_at) VALUES
 (1,3,'Study desk lamp flickers','The lamp above the desk in room 201 flickers in the evening and the bulb gets hot.','low','open',3,NULL),
 (2,3,'Weak water pressure in the shower','Pressure drops every evening around seven.','normal','in_progress',3,NULL),
 (3,4,'Window latch will not close','The second-floor window latch broke, so the room cannot be secured at night.','high','escalated',2,NOW());
