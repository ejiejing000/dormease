USE dormease;

INSERT IGNORE INTO utility_types(id,code,name) VALUES (1,'WATER','Water'),(2,'POWER','Electricity');

INSERT IGNORE INTO utility_rates(id,house_id,utility_type_id,fixed_charge,effective_from) VALUES
 (1,1,1,150.00,'2026-01-01'),
 (2,1,2,120.00,'2026-01-01'),
 (3,2,1,180.00,'2026-01-01'),
 (4,2,2,150.00,'2026-01-01');

INSERT IGNORE INTO rate_tiers(id,utility_rate_id,lower_units,upper_units,price_per_unit) VALUES
 (1,1,0,10,25.0000),(2,1,10,25,35.0000),(3,1,25,NULL,48.0000),
 (4,2,0,50,9.5000),(5,2,50,150,11.2500),(6,2,150,NULL,13.0000),
 (7,3,0,10,30.0000),(8,3,10,NULL,42.0000),
 (9,4,0,50,10.5000),(10,4,50,NULL,12.7500);

INSERT IGNORE INTO meter_readings(tenancy_id,utility_type_id,reading_period,previous_reading,current_reading,recorded_by) VALUES
 (3,1,@month,120.000,138.500,2),
 (3,2,@month,2100.000,2176.000,2);

INSERT IGNORE INTO bills(id,tenancy_id,billing_month,rent_amount,water_amount,electricity_amount,total_amount,due_date,status) VALUES
 (3,3,@month,3500.00,747.50,878.00,5125.50,DATE_ADD(@month,INTERVAL 10 DAY),'unpaid');

INSERT IGNORE INTO bill_items(bill_id,description,quantity,unit_price,amount) VALUES
 (3,'Monthly rent',1,3500.0000,3500.00),
 (3,'Water (18.5 cubic meters)',18.5,32.0270,592.50),
 (3,'Water service charge',1,150.0000,150.00),
 (3,'Electricity (76 kWh)',76,9.9737,758.00),
 (3,'Electricity service charge',1,120.0000,120.00);
