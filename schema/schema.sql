CREATE TABLE IF NOT EXISTS Calendar (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_fk INT NULL,
	name VARCHAR(45) NOT NULL
);

CREATE TABLE IF NOT EXISTS Meeting (
	id INT AUTO_INCREMENT PRIMARY KEY,
	name VARCHAR(50) NOT NULL,
	startDateTime datetime NOT NULL,
	endDateTime datetime NOT NULL,
	createdAt datetime default CURRENT_TIMESTAMP NOT NULL,
	updatedAt datetime default CURRENT_TIMESTAMP NOT NULL on update CURRENT_TIMESTAMP,
	user_calendar_fk INT NULL,
	organizing_event INT NULL,
	CONSTRAINT usercalendarfk FOREIGN KEY (user_calendar_fk) REFERENCES Calendar (id),
	CONSTRAINT organizer FOREIGN KEY (organizing_event) REFERENCES Calendar (id)
);

CREATE INDEX organizer_idx on Meeting (organizing_event);

CREATE INDEX usercalendarfk_idx on Meeting (user_calendar_fk);

CREATE TABLE IF NOT EXISTS MeetingRoom (
	id INT AUTO_INCREMENT PRIMARY KEY,
	name VARCHAR(45) NOT NULL,
	calendar_fk INT NULL,
	CONSTRAINT room_calendarFK FOREIGN KEY (calendar_fk) REFERENCES Calendar (id)
);

CREATE INDEX room_calendarFK_idx ON MeetingRoom (calendar_fk);

CREATE TABLE IF NOT EXISTS User (
	id INT AUTO_INCREMENT PRIMARY KEY,
	email VARCHAR(100) NOT NULL,
	given_name VARCHAR(50) NOT NULL,
	family_name VARCHAR(50) NOT NULL,
	primary_calendar_fk INT NULL,
	CONSTRAINT calendarFk FOREIGN KEY (primary_calendar_fk) REFERENCES Calendar (id)
);

CREATE INDEX calendarFk_idx ON User (primary_calendar_fk);
