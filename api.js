'use strict';

var Promise = require('promise');
var db = require('./database');

var exports = module.exports = {};

exports.testConnection = db.testConnection;

exports.cleanUp = function() {
    db.cleanUp();
};

const getError = function(err) {
    return new Promise(function (resolve, reject) {
        reject({status: "FAILURE", error: err.message})
    });
};

const getMany = function(results) {
    return new Promise(function (resolve, reject) {
        resolve({status: "OK", value: results});
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

// Meeting operations

exports.getMeetingById = function (meetingId) {
    const sql = "SELECT * FROM ebdb.Meeting WHERE id = " + db.pool.escape(meetingId);
    let connection;
    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(sql); })
        .then(results => { return getOne(results)})
        .finally(() => { if(connection) { connection.release(); }});
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

const getResourcesForRoomsByRoomId = function(conn, room_ids) {

    let sql = "SELECT DISTINCT MR.id, RR.name from ebdb.MeetingRoom MR";
    sql += "\tJOIN ebdb.RoomResourceMeetingRoomAssociation RRMRA on RRMRA.room = MR.id";
    sql += "\tJOIN ebdb.RoomResource RR on RRMRA.resource = RR.id";
    sql += "\tWHERE MR.id in (?)";

    return conn.query(sql, [room_ids])
        .then(results => { return getMany(results)})
        .catch(err => { return getError(err)});
};

const addResourcesToRoom = function (room, roomResources) {
    return new Promise(function (resolve, reject) {
        room.resources = [];
        for (let i = 0; i < roomResources.length; i++) {
            const roomResource = roomResources[i];
            room.resources.push(roomResource.name);
        }
        resolve(room);
    });
};

exports.getRoomByName = function (roomName) {
    const sql = "SELECT * FROM ebdb.MeetingRoom WHERE name = " + db.pool.escape(roomName);
    let connection;
    let object;

    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(sql); })
        .then(results => { return getOne(results)})
        .then(obj => { object = obj; return getResourcesForRoomsByRoomId(connection, [obj.result.id]) })
        .then(roomResources => { return addResourcesToRoom(object.result, roomResources.value)})
        .then(() => { return new Promise(function(resolve, reject){ resolve(object)} )} )
        .finally(() => { if(connection) { connection.release(); }});
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
                            const response = {rooms: []};
                            const room_ids = roomIds.map(a => a.id);
                            for (let i = 0; i < room_ids.length; i++) {
                                response.rooms.push({id: room_ids[i], resources: []});
                            }
                            conn.query(describeSQL, [room_ids])
                                .then(function (roomDescriptions) {
                                    for (let i = 0; i < roomDescriptions.length; i++) {
                                        const roomDescription = roomDescriptions[i];
                                        const room = response.rooms.find(e => {return e.id === roomDescription.id});
                                        room.name = roomDescription.name;
                                    }

                                    getResourcesForRoomsByRoomId(room_ids)
                                        .then(function (result) {
                                            if (result.status === "OK") {
                                                const roomResources = result.value;
                                                for (let i = 0; i < roomResources.length; i++) {
                                                    const roomResource = roomResources[i];
                                                    const room = response.rooms.find(e => {return e.id === roomResource.id});
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

const getMeetingsByRoomResponse = function (results) {
    return new Promise(function (resolve, reject) {
        if (results.length === 0) {
            resolve({status: "NOT FOUND"});
        } else {
            resolve({status: "FOUND", result: { meetings: results}});
        }
    });
};

exports.getMeetingsByRoomName = function (roomName) {
    let sql = "SELECT * FROM ebdb.Meeting ";
    sql += "WHERE room_name = " + db.pool.escape(roomName);
    sql += "\tAND organizing_event IS NULL";
    sql += "\tORDER BY start_datetime";

    let connection;
    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(sql); })
        .then(results => { return getMeetingsByRoomResponse(results)})
        .catch(err => { return getError(err)})
        .finally(() => { console.log(connection); if(connection) { connection.release(); }});
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

const getUsersResponse = function (results) {
    return new Promise(function (resolve, reject) {
        if (results.length === 0) {
            resolve({status: "NOT FOUND"});
        } else {
            const users = [];
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const user = {
                    userId: result.id,
                    givenName: result.given_name || null,
                    familyName: result.family_name || null,
                    email: result.email
                };
                users.push(user);
            }
            resolve({status: "FOUND", result: { users: users}});
        }
    });
};

exports.getUsers = function(parameters) {
    let selectSQL = "SELECT * FROM ebdb.User";

    const constraints = [];

    if(parameters.hasOwnProperty("email")) {
        constraints.push("email = " + db.pool.escape(parameters.email));
    }

    if(parameters.hasOwnProperty("givenName")) {
        constraints.push("given_name = " + db.pool.escape(parameters.givenName));
    }

    if(parameters.hasOwnProperty("familyName")) {
        constraints.push("family_name = " + db.pool.escape(parameters.familyName));
    }

    if(constraints.length > 0) {
        selectSQL += " WHERE " + constraints.join(" AND ");
    }

    let connection;
    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(selectSQL)})
        .then(results => { return getUsersResponse(results)})
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