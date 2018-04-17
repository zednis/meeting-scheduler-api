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
	CONSTRAINT organizing_event_fk FOREIGN KEY (organizing_event) REFERENCES Meeting (id) ON DELETE CASCADE
);

CREATE INDEX meeting_organizing_event_idx on Meeting (organizing_event);

CREATE INDEX meeting_calendar_idx on Meeting (calendar);

CREATE TABLE IF NOT EXISTS MeetingRoom (
	id INT AUTO_INCREMENT PRIMARY KEY,
	name VARCHAR(45) NOT NULL UNIQUE,
	created_at datetime default CURRENT_TIMESTAMP NOT NULL,
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

CREATE TABLE IF NOT EXISTS RoomResource (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(45) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS RoomResourceMeetingRoomAssociation (
    room INT NOT NULL,
    resource INT NOT NULL,
    PRIMARY KEY (room, resource),
    CONSTRAINT room_resource_meeting_room_association_room_fk FOREIGN KEY (room) REFERENCES MeetingRoom (id) ON DELETE CASCADE,
    CONSTRAINT room_resource_meeting_room_association_resource_fk FOREIGN KEY (resource) REFERENCES RoomResource (id) ON DELETE CASCADE
);

ALTER TABLE Meeting ADD COLUMN room_name VARCHAR(50) NULL;