USE dormease;
-- Member 5 — Maintenance tickets, status history, notifications and the email outbox.
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  channel ENUM('in_app','email') DEFAULT 'in_app',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notifications_user_read(user_id, is_read),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenancy_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  priority ENUM('low','normal','high','urgent') DEFAULT 'normal',
  status ENUM('open','in_progress','resolved','closed','escalated') DEFAULT 'open',
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  escalated_at DATETIME NULL,
  KEY idx_tickets_status_created(status, created_at),
  FOREIGN KEY (tenancy_id) REFERENCES tenancies(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ticket_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  recipient VARCHAR(190) NOT NULL,
  subject VARCHAR(190) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('queued','sent','failed') DEFAULT 'queued',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_ticket_escalation_once;
DELIMITER //
CREATE TRIGGER trg_ticket_escalation_once
BEFORE UPDATE ON maintenance_tickets
FOR EACH ROW
BEGIN
  IF OLD.escalated_at IS NULL AND NEW.status='escalated' THEN
    SET NEW.escalated_at=NOW();
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_ticket_history_on_insert;
DELIMITER //
CREATE TRIGGER trg_ticket_history_on_insert
AFTER INSERT ON maintenance_tickets
FOR EACH ROW
BEGIN
  INSERT INTO ticket_status_history(ticket_id,status,changed_by,note)
  VALUES(NEW.id,NEW.status,NEW.created_by,'created');
END//
DELIMITER ;
