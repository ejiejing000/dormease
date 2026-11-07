USE dormease;

INSERT IGNORE INTO houses(id,name,address,description,owner_user_id) VALUES
 (1,'Demo Boarding House','Rizal Avenue, Dumaguete City','Quiet five-minute walk to the campus gate.',1),
 (2,'Santo Niño Haus','Purok 4, Dumaguete City','Air-conditioned rooms with common study area.',1);

INSERT IGNORE INTO rooms(id,house_id,room_number,monthly_rent,bed_capacity,cooling_type,storage_available,amenities,photo_url,is_listed) VALUES
 (1,1,'101',3500.00,2,'fan',TRUE,JSON_ARRAY('Study table','Cabinet'),NULL,TRUE),
 (2,1,'102',4500.00,1,'aircon',TRUE,JSON_ARRAY('Study table','Closet','Balcony'),NULL,TRUE),
 (3,1,'201',2800.00,3,'fan',FALSE,JSON_ARRAY('Shared desk'),NULL,TRUE),
 (4,2,'A1',5200.00,2,'aircon',TRUE,JSON_ARRAY('Study table','Closet','En-suite CR'),NULL,TRUE),
 (5,2,'B2',3000.00,2,'none',FALSE,JSON_ARRAY('Cabinet'),NULL,FALSE);

INSERT IGNORE INTO room_amenities(id,name) VALUES
 (1,'Study table'),(2,'Cabinet'),(3,'Closet'),(4,'Balcony'),(5,'En-suite CR'),(6,'Shared desk');

INSERT IGNORE INTO room_amenity_map(room_id,amenity_id) VALUES
 (1,1),(1,2),(2,1),(2,3),(2,4),(4,1),(4,3),(4,5);
