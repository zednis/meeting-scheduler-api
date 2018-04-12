use ebdb;

CREATE TABLE IF NOT EXISTS Calendar (
	id INT AUTO_INCREMENT PRIMARY KEY,
	name VARCHAR(45) NOT NULL
);

CREATE TABLE IF NOT EXISTS Meeting (
	id INT AUTO_INCREMENT PRIMARY KEY,
	name VARCHAR(50) NOT NULL,
	start_datetime datetime NOT NULL,
	end_datetime datetime NOT NULL,
	created_at datetime default CURRENT_TIMESTAMP NOT NULL,
	updated_at datetime default CURRENT_TIMESTAMP NOT NULL on update CURRENT_TIMESTAMP,
	calendar INT NOT NULL,
	organizing_event INT NULL,
	CONSTRAINT meeting_calendar_fk FOREIGN KEY (calendar) REFERENCES Calendar (id)  ON DELETE CASCADE,
	CONSTRAINT organizing_event_fk FOREIGN KEY (organizing_event) REFERENCES Calendar (id) ON DELETE CASCADE
);

CREATE INDEX meeting_organizing_event_idx on Meeting (organizing_event);

CREATE INDEX meeting_calendar_idx on Meeting (calendar);

CREATE TABLE IF NOT EXISTS MeetingRoom (
	id INT AUTO_INCREMENT PRIMARY KEY,
	name VARCHAR(45) NOT NULL UNIQUE,
	calendar INT NULL,
	CONSTRAINT meeting_room_calendar_fk FOREIGN KEY (calendar) REFERENCES Calendar (id) ON DELETE CASCADE
);

CREATE INDEX meeting_room_name_idx ON MeetingRoom (name);

CREATE INDEX meeting_room_calendar_idx ON MeetingRoom (calendar);

CREATE TABLE IF NOT EXISTS User (
	id INT AUTO_INCREMENT PRIMARY KEY,
	email VARCHAR(100) NOT NULL,
	given_name VARCHAR(50) NOT NULL,
	family_name VARCHAR(50) NOT NULL,
	primary_calendar INT NULL,
	CONSTRAINT user_primary_calendar_fk FOREIGN KEY (primary_calendar) REFERENCES Calendar (id) ON DELETE SET NULL
);

CREATE INDEX user_primary_calendar_idx ON User (primary_calendar);

ALTER TABLE Meeting DROP FOREIGN KEY organizing_event_fk;
ALTER TABLE Meeting DROP INDEX meeting_organizing_event_idx;
