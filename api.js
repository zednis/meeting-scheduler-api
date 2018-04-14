'use strict';

var Promise = require('promise');
var db = require('./database');

var exports = module.exports = {};

exports.testConnection = db.testConnection;

exports.cleanUp = function() {
    db.cleanUp();
};

// Meeting operations

exports.getMeetingById = function (meetingId) {
    const sql = "SELECT * FROM ebdb.Meeting WHERE id = " + db.pool.escape(meetingId);

    return new Promise(function (resolve, reject) {
        db.pool.getConnection()
            .then(function (conn){
                conn.query(sql)
                    .then(function (results) {
                        if (results.length === 1) {
                            resolve({status: "FOUND", result: results[0]});
                        } else if (results.length === 0) {
                            resolve({status: "NOT FOUND"});
                        } else {
                            reject({status: "FOUND MANY"});
                        }
                        conn.release();
                    })
                    .catch(function (err) {
                        console.warn(err);
                        reject({status: "FAILURE", error: err});
                        conn.release();
                    });
            });
    });
};

exports.createMeeting = function(meeting) {

    const getRoomSQL = "SELECT * FROM ebdb.MeetingRoom WHERE name = (?);";
    const getUsersByEmailSql = "SELECT * FROM ebdb.User where email in (?);";
    const createMeetingSql = "INSERT INTO ebdb.Meeting (name, start_datetime, end_datetime, calendar, organizing_event, room_name) VALUES (?,?,?,?,?,?);";
    const createParticipantMeetingsSql = "INSERT INTO ebdb.Meeting (name, start_datetime, end_datetime, calendar, organizing_event, room_name) VALUES ?";

    var organizerEmail = meeting.participants[0];
    var participantEmails = meeting.participants.slice(1);

    return new Promise(function (resolve, reject) {

        let conn;
        db.pool.getConnection()
            .then(function (_conn) {
                conn = _conn;
                conn.beginTransaction()
                    .then(() => {

                        // TODO what if roomName is null?

                        console.log(db.formatQuery(getRoomSQL, [meeting.room]));
                        conn.query(getRoomSQL, [meeting.room])
                            .then(results => {
                                if(results.length === 0) {
                                    reject({status: "FAILURE", error: "meeting room not found"})
                                } else {
                                    conn.query(getUsersByEmailSql, [organizerEmail])
                                        .then(results => {
                                            if(results.length === 0) {
                                                reject({status: "FAILURE", error: "organizer not found"})
                                            } else {
                                                const organizerCalendarId = results[0].primary_calendar;
                                                const organizerMeetingInserts = [
                                                    meeting.name,
                                                    db.formatDatetime(meeting.startDateTime),
                                                    db.formatDatetime(meeting.endDateTime),
                                                    organizerCalendarId,
                                                    null,
                                                    meeting.room];

                                                console.log(db.formatQuery(createMeetingSql, organizerMeetingInserts));
                                                conn.query(createMeetingSql, organizerMeetingInserts)
                                                    .then(organizingMeetingResults => {
                                                        const organizerMeetingId = organizingMeetingResults.insertId;
                                                        if(participantEmails.length === 0) {
                                                            // done! commit transaction
                                                            conn.commit()
                                                                .then(() => {
                                                                    resolve({status: "SUCCESS", createdId: organizerMeetingId});
                                                                });
                                                        } else {
                                                            // add create meetings on participant calendars
                                                            conn.query(getUsersByEmailSql, [participantEmails])
                                                                .then(results => {
                                                                    const inserts = [];
                                                                    for(let i = 0; i < results.length; i++) {
                                                                        const participantMeetingInsert = [
                                                                            meeting.name,
                                                                            db.formatDatetime(meeting.startDateTime),
                                                                            db.formatDatetime(meeting.endDateTime),
                                                                            results[i].primary_calendar,
                                                                            organizerMeetingId,
                                                                            meeting.room
                                                                        ];
                                                                        inserts.push(participantMeetingInsert);
                                                                    }
                                                                    conn.query(createParticipantMeetingsSql, [inserts])
                                                                        .then(result => {
                                                                            // done!  commit transaction
                                                                            conn.commit()
                                                                                .then(() => {
                                                                                    resolve({status: "SUCCESS", createdId: organizerMeetingId});
                                                                                });
                                                                        });

                                                                });
                                                        }
                                                    });
                                            }
                                        });
                                }
                            });
                    })
                    .catch(err => {
                        console.log("in SQL exception handler");
                        conn.rollback().then(() => { reject({status: "FAILURE", error: err.message}); })
                    });
            })
            .finally(() => {
                if(conn) { conn.release(); }
            });
    });
};

exports.updateMeeting = function(obj) {

    let sql = "UPDATE ebdb.Meeting";
    let setAlreadyFlag = false; //becomes true if one of the fields has been set
    const sqlInserts = {
        name: obj.body.name || null,
        startDateTime: db.formatDatetime(obj.body.startDateTime) || null,
        endDateTime: db.formatDatetime(obj.body.endDateTime) || null
    };

    for (const key in sqlInserts) {
        if (sqlInserts.hasOwnProperty(key)) {
            sql += (setAlreadyFlag) ? ", " : " SET ";
            setAlreadyFlag = true;
            sql += " " + key + " = " + db.pool.escape(sqlInserts[key]);
        }
    }

    sql += " WHERE id = " + db.pool.escape(obj.meetingId);

    return new Promise(function (resolve, reject) {
        db.pool.query(sql, function(error, results) {
            if (error) {
                console.warn("Update Query failed");
                reject({status: "ERROR", error: error});
            } else {
                resolve({status: "OK", itemsUpdated: results.affectedRows});
            }
        });
    });
};

exports.deleteMeeting = function (meetingId) {
    const sql = "DELETE FROM ebdb.Meeting WHERE id = " + db.pool.escape(meetingId);
    return new Promise(function (resolve, reject) {
        db.pool.getConnection()
            .then(function (conn) {
                conn.query(sql)
                    .then(function (results) {
                        resolve({status: "SUCCESS", itemsDeleted: results.affectedRows});
                        conn.release();
                    })
                    .catch(function (err) {
                        console.warn(err);
                        reject({status: "FAILURE", error: err});
                        conn.release();
                    });
            });
    });
};

// Room operations

const getResourcesForRoomsByRoomId = function(room_ids) {

    let sql = "SELECT DISTINCT MR.id, RR.name from ebdb.MeetingRoom MR";
    sql += "\tJOIN ebdb.RoomResourceMeetingRoomAssociation RRMRA on RRMRA.room = MR.id";
    sql += "\tJOIN ebdb.RoomResource RR on RRMRA.resource = RR.id";
    sql += "\tWHERE MR.id in (?)";

    return new Promise(function (resolve, reject) {
        db.pool.getConnection()
            .then(function (conn) {
                conn.query(sql, [room_ids])
                    .then(function (results) {
                        console.log(results);
                        resolve({status: "OK", value: results});
                    })
                    .catch(function (err) {
                        console.warn(err);
                        reject({status: "FAILURE", error: err});
                    }).finally(() => {
                        if(conn) { conn.release(); }
                    });
            });
    });

};

exports.getRooms = function(parameters) {

    // SELECT ROOM SQL

    let selectSQL = "SELECT DISTINCT MR.id from ebdb.MeetingRoom MR";

    if(parameters.hasOwnProperty("resources")) {
        selectSQL += "\tJOIN ebdb.RoomResourceMeetingRoomAssociation RRMRA  on RRMRA.room = MR.id";
        selectSQL += "\tJOIN ebdb.RoomResource RR on RRMRA.resource = RR.id";
    }

    if(parameters.hasOwnProperty("resources")) {
        selectSQL += "\tWHERE RR.name = " + db.pool.escape(parameters.resources);
    }

    // DESCRIBE ROOM SQL

    let describeSQL = "SELECT DISTINCT MR.* from ebdb.MeetingRoom MR";
    describeSQL += "\tWHERE MR.id in (?)";

    return new Promise(function (resolve, reject) {
        db.pool.getConnection()
            .then(function (conn) {
                conn.query(selectSQL)
                    .then(function (roomIds) {
                        if (roomIds.length === 0) {
                            resolve({status: "NOT FOUND"});
                        } else {
                            const response = {meetings: []};
                            const room_ids = roomIds.map(a => a.id);
                            for (let i = 0; i < room_ids.length; i++) {
                                response.meetings.push({id: room_ids[i], resources: []});
                            }
                            conn.query(describeSQL, [room_ids])
                                .then(function (roomDescriptions) {
                                    for (let i = 0; i < roomDescriptions.length; i++) {
                                        const roomDescription = roomDescriptions[i];
                                        const room = response.meetings.find(e => {return e.id === roomDescription.id});
                                        room.name = roomDescription.name;
                                    }

                                    getResourcesForRoomsByRoomId(room_ids)
                                        .then(function (result) {
                                            if (result.status === "OK") {
                                                const roomResources = result.value;
                                                for (let i = 0; i < roomResources.length; i++) {
                                                    const roomResource = roomResources[i];
                                                    const room = response.meetings.find(e => {return e.id === roomResource.id});
                                                    room.resources.push(roomResource.name);
                                                }
                                                resolve({status: "FOUND", result: response});
                                            }
                                        });
                                });
                        }
                    })
                    .catch(function (err) {
                        console.warn(err);
                        reject({status: "FAILURE", error: err});
                    })
                    .finally(() => {
                        if(conn) { conn.release(); }
                    });
            });
    });

};

exports.getRoomByName = function (roomName) {
    const sql = "SELECT * FROM ebdb.MeetingRoom WHERE name = " + db.pool.escape(roomName);

    return new Promise(function (resolve, reject) {
        db.pool.getConnection()
            .then(function (conn){
                conn.query(sql)
                    .then(function (results) {
                        if (results.length === 1) {
                            resolve({status: "FOUND", result: results[0]});
                        } else if (results.length === 0) {
                            resolve({status: "NOT FOUND"});
                        } else {
                            reject({status: "FOUND MANY"});
                        }
                        conn.release();
                    })
                    .catch(function (err) {
                        console.warn(err);
                        reject({status: "FAILURE", error: err});
                        conn.release();
                    });
            });
    });
};

exports.getMeetingsByRoomName = function(roomName) {

    let sql = "SELECT * FROM ebdb.Meeting ";
    sql += "WHERE room_name = " + db.pool.escape(roomName);
    sql += "\tAND organizing_event IS NULL";
    sql += "\tORDER BY start_datetime";

    return new Promise(function (resolve, reject) {

        // first check that the room exists
        exports.getRoomByName(roomName)
            .then(function (result) {
                if (result.status === "NOT FOUND") {
                    // room not found
                    resolve(result);
                } else {

                    // room found, query for all meetings
                    db.pool.getConnection()
                        .then(function (conn){
                            conn.query(sql)
                                .then(function (results) {
                                    if (results.length === 0) {
                                        resolve({status: "NOT FOUND"});
                                    } else {
                                        const response = {
                                            meetings: results
                                        };
                                        resolve({status: "FOUND", result: response});
                                    }
                                    conn.release();
                                })
                                .catch(function (err) {
                                    console.warn(err);
                                    reject({status: "FAILURE", error: err});
                                    conn.release();
                                });
                        });
                }
            })
            .catch(function (err) {
                reject(err);
            });
    });
};

exports.createRoom = function (room) {

    const calendarName = room.name + "'s Meeting Room Calendar" || "";
    const calendarSql = "INSERT INTO ebdb.Calendar (name) VALUES (?);";
    const roomSql = "INSERT INTO ebdb.MeetingRoom (name, calendar) VALUES (?, ?);";

    return new Promise(function (resolve, reject) {
        db.pool.getConnection()
            .then(function (conn) {
                conn.query(calendarSql, [calendarName])
                    .then(function (results) {
                        const inserts = [room.name, results.insertId];
                        conn.query(roomSql, inserts)
                            .then(function (results) {
                                resolve({status: "SUCCESS", createdId: room.name});
                                conn.release();
                            })
                            .catch(function (err) {
                                console.warn(err);
                                reject({status: "FAILURE", error: err});
                                conn.release();
                            });
                    })
                    .catch(function (err) {
                        console.warn(err);
                        reject({status: "FAILURE", error: err});
                        conn.release();
                    });
            });
    });
};

exports.updateRoom = function(obj) {
    const roomName = obj.body.name || null;
    let sql = "UPDATE ebdb.MeetingRoom SET name = " + db.pool.escape(roomName);
    sql += " WHERE id = " + db.pool.escape(obj.roomId);

    return new Promise(function (resolve, reject) {
        db.pool.query(sql, function(error, results) {
            if (error) {
                console.warn("Update Query failed");
                reject({status: "ERROR", error: error});
            } else {
                resolve({status: "OK", itemsUpdated: results.affectedRows});
            }
        });
    });
};

exports.deleteRoom = function(roomId) {

    const deleteCalendarSql = "DELETE FROM ebdb.Calendar WHERE id in (SELECT calendar from ebdb.MeetingRoom WHERE id = " + db.pool.escape(roomId) + ")";
    const deleteRoomSql = "DELETE FROM ebdb.MeetingRoom WHERE id = " + db.pool.escape(roomId);

    return new Promise(function (resolve, reject) {
        db.pool.getConnection()
            .then(function (conn) {
                conn.query(deleteCalendarSql)
                    .then(function (results) {
                        conn.query(deleteRoomSql)
                            .then(function (results) {
                                resolve({status: "SUCCESS", itemsDeleted: results.affectedRows});
                                conn.release();
                            })
                            .catch(function (err) {
                                console.warn(err);
                                reject({status: "FAILURE", error: err});
                                conn.release();
                            });
                    })
                    .catch(function (err) {
                        console.warn(err);
                        reject({status: "FAILURE", error: err});
                        conn.release();
                    });
            });
    });
};

// User operations

const getMany = function (results) {
    return new Promise(function (resolve, reject) {
        if (results.length === 1) {
            resolve({status: "FOUND", result: results});
        } else if (results.length === 0) {
            resolve({status: "NOT FOUND"});
        }
    });
};

const getOne = function (results) {
    return new Promise(function (resolve, reject) {
        if (results.length === 1) {
            resolve({status: "FOUND", result: results[0]});
        } else if (results.length === 0) {
            resolve({status: "NOT FOUND"});
        } else {
            reject({status: "FOUND MANY"});
        }
    });
};

exports.getUserById = function (userId) {
    const sql = "SELECT * FROM ebdb.User WHERE id = " + db.pool.escape(userId);
    let connection;
    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(sql); })
        .then(results => { return getOne(results)})
        .finally(() => { if(connection) { connection.release(); }});
};

exports.getUserByEmail = function(email) {
    const sql = "SELECT * FROM ebdb.User WHERE email = " + db.pool.escape(email);
    let connection;
    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(sql); })
        .then(results => { return getOne(results)})
        .finally(() => { if(connection) { connection.release(); }});
};

exports.createUser = function (user) {

    const calendarName = user.email + "'s Calendar" || "";
    const calendarSql = "INSERT INTO ebdb.Calendar (name) VALUES (?);";
    const userSql = "INSERT INTO ebdb.User (email, given_name, family_name, primary_calendar) VALUES (?, ?, ?, ?);";

    return new Promise(function (resolve, reject) {
        db.pool.getConnection()
            .then(function (conn) {
                conn.query(calendarSql, [calendarName])
                    .then(function (results) {
                        const inserts = [user.email, user.givenName, user.familyName, results.insertId];
                        conn.query(userSql, inserts)
                            .then(function (results) {
                                resolve({status: "SUCCESS", createdId: results.insertId});
                                conn.release();
                            })
                            .catch(function (err) {
                                console.warn(err);
                                reject({status: "FAILURE", error: err});
                                conn.release();
                            });
                    })
                    .catch(function (err) {
                        console.warn(err);
                        reject({status: "FAILURE", error: err});
                        conn.release();
                    });
            });
    });
};

exports.updateUser = function(obj) {

    let sql = "UPDATE ebdb.User";
    let setAlreadyFlag = false; //becomes true if one of the fields has been set
    const sqlInserts = {
        email: obj.body.email || null,
        given_name: obj.body.givenName || null,
        family_name: obj.body.familyName || null
    };

    for (const key in sqlInserts) {
        if (sqlInserts.hasOwnProperty(key)) {
            sql += (setAlreadyFlag) ? ", " : " SET ";
            setAlreadyFlag = true;
            sql += " " + key + " = " + db.pool.escape(sqlInserts[key]);
        }
    }

    sql += " WHERE id = " + db.pool.escape(obj.userId);

    return new Promise(function (resolve, reject) {
        db.pool.query(sql, function(error, results) {
            if (error) {
                console.warn("Update Query failed");
                reject({status: "ERROR", error: error});
            } else {
                resolve({status: "OK", itemsUpdated: results.affectedRows});
            }
        });
    });
};

exports.deleteUser = function (userId) {

    const deleteCalendarSql = "DELETE FROM ebdb.Calendar WHERE id in (SELECT primary_calendar from ebdb.User WHERE id = " + db.pool.escape(userId) + ")";
    const deleteUserSql = "DELETE FROM ebdb.User WHERE id = " + db.pool.escape(userId);

    return new Promise(function (resolve, reject) {
        db.pool.getConnection()
            .then(function (conn) {
                conn.query(deleteCalendarSql)
                    .then(function (results) {
                        conn.query(deleteUserSql)
                            .then(function (results) {
                                resolve({status: "SUCCESS", itemsDeleted: results.affectedRows});
                                conn.release();
                            })
                            .catch(function (err) {
                                console.warn(err);
                                reject({status: "FAILURE", error: err});
                                conn.release();
                            });
                    })
                    .catch(function (err) {
                        console.warn(err);
                        reject({status: "FAILURE", error: err});
                        conn.release();
                    });
            });
    });
};