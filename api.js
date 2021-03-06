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
        reject({status: "FAILURE", message: err.message})
    });
};

const getMany = function(results, formatter=null) {
    return new Promise(function (resolve, reject) {
        let response = results;
        if(formatter) {
            response = [];
            for (let i = 0; i < results.length; i++) {
                response.push(formatter(results[i]));
            }
        }
        resolve({status: "OK", value: {items: response}});
    });
};

const getOne = function (results, formatter=null) {
    return new Promise(function (resolve, reject) {
        if (results.length === 1) {
            let response = results[0];
            if(formatter) { response = formatter(response) }
            resolve({status: "OK", value: response});
        } else if (results.length === 0) {
            reject({status: "NOT FOUND"});
        } else {
            reject({status: "FOUND MANY"});
        }
    });
};

const getCreated = function (results, createdId=null) {
    const foo = (createdId) ? createdId : results.insertId;
    return new Promise(function (resolve, reject) { resolve({status: "SUCCESS", createdId: foo}); });
};

const finish = function (object) {
    return new Promise(function(resolve, reject){ resolve(object); });
};

// Meeting operations

const meetingFormatter = function(result) {

    return {
        meetingId: result.id,
        name: result.name,
        startDateTime: result.start_datetime,
        endDateTime: result.end_datetime,
        createdAt: result.created_at,
        participants: [],
        room: result.room_name || null
    };
};

const getOrganizerForMeeting = function (conn, meetingId) {

    let sql = "SELECT DISTINCT U.* from ebdb.Meeting M";
    sql += " JOIN ebdb.Meeting M2 on M2.organizing_event = M.id";
    sql += " JOIN ebdb.Calendar C on M.calendar = C.id";
    sql += " JOIN ebdb.User U on C.id = U.primary_calendar";
    sql += " WHERE M2.id = " + db.pool.escape(meetingId);
    sql += " UNION";
    sql += " SELECT DISTINCT U.* from ebdb.Meeting M";
    sql += " JOIN ebdb.User U On U.primary_calendar = M.calendar";
    sql += " WHERE M.id = "+ db.pool.escape(meetingId) +" and M.organizing_event IS NULL";

    return conn.query(sql)
        .then(results => { return getOne(results)})
        .catch(err => { return getError(err)});
};

const getParticipantsForMeeting = function(conn, meetingId) {

    let sql = "SELECT DISTINCT U.* from ebdb.Meeting M";
    sql += " JOIN ebdb.Meeting M2 on M.organizing_event = M2.id";
    sql += " JOIN ebdb.Meeting M3 on M3.organizing_event = M2.id";
    sql += " JOIN ebdb.Calendar C on M3.calendar = C.id";
    sql += " JOIN ebdb.User U on C.id = U.primary_calendar";
    sql += " WHERE M.id = " + db.pool.escape(meetingId) + " OR M2.id = " + db.pool.escape(meetingId);

    return conn.query(sql)
        .then(results => { return getMany(results)})
        .catch(err => { return getError(err)});
};

const addOrganizerToMeetingResponse = function(meeting, organizer) {
    return new Promise(function (resolve, reject) {
        meeting.participants.push(organizer.email);
        resolve(meeting);
    });
};

const addParticipantsToMeetingResponse = function(meeting, participants) {
    return new Promise(function (resolve, reject) {
        for(let i = 0; i < participants.length; i++) {
            meeting.participants.push(participants[i].email);
        }
        resolve(meeting);
    });
};

exports.getMeetingById = function (meetingId) {
    const sql = "SELECT * FROM ebdb.Meeting WHERE id = " + db.pool.escape(meetingId);
    let connection, object;
    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(sql); })
        .then(results => { return getOne(results, meetingFormatter)})
        .then(obj => { object = obj; return getOrganizerForMeeting(connection, [object.value.id])})
        .then(organizer => { return addOrganizerToMeetingResponse(object.value, organizer.value) })
        .then(() => { return getParticipantsForMeeting(connection, [object.value.id])})
        .then(participants => { return addParticipantsToMeetingResponse(object.value, participants.value) })
        .then(() => { return finish(object); })
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
                        conn.query(getRoomSQL, [meeting.room]) //check if room exists
                            .then(results => {
                                if(results.length === 0) {
                                    reject({status: "FAILURE", error: "meeting room not found"})
                                } else {
                                    conn.query(getUsersByEmailSql, [organizerEmail]) //get all participants
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
                        conn.rollback().then(() => { reject({status: "FAILURE", message: err.message}); })
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
        start_datetime: db.formatDatetime(obj.body.startDateTime) || null,
        end_datetime: db.formatDatetime(obj.body.endDateTime) || null
    };

    //construct UPDATE query
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
    sql += " JOIN ebdb.RoomResourceMeetingRoomAssociation RRMRA on RRMRA.room = MR.id";
    sql += " JOIN ebdb.RoomResource RR on RRMRA.resource = RR.id";
    sql += " WHERE MR.id in (?)";

    return conn.query(sql, [room_ids])
        .then(results => { return getMany(results)})
        .catch(err => { return getError(err.message)});
};

const addResourcesToRooms = function(rooms, roomResources) {
    return new Promise(function (resolve, reject) {
        for(let i = 0; i < rooms.length; i++) {
            for(let j = 0; j < roomResources.length; j++) {
                if(roomResources[j].id === rooms[i].roomId) {
                    rooms[i].resources.push(roomResources[j].name);
                }
            }
        }
        resolve(rooms);
    });
};

exports.getRoomByName = function (roomName) {
    const sql = "SELECT * FROM ebdb.MeetingRoom WHERE name = " + db.pool.escape(roomName);
    let connection;
    let object;

    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(sql); })
        .then(results => { return getOne(results, roomFormatter)})
        .then(obj => { object = obj; return getResourcesForRoomsByRoomId(connection, [obj.value.roomId]) })
        .then(roomResources => { return addResourcesToRooms([object.value], roomResources.value.items)})
        .then(() => { return finish(object); })
        .catch(err => { return getError(err)})
        .finally(() => { if(connection) { connection.release(); }});
};

const roomFormatter = function (result) {
    return {
        roomId: result.id,
        name: result.name || null,
        resources: []
    }
};

exports.getRooms = function(parameters) {

    let selectSQL = "SELECT DISTINCT MR.* from ebdb.MeetingRoom MR";

    const joins = [];
    const constraints = [];

    if(parameters.hasOwnProperty("nameContains")) {
        constraints.push("LOWER(MR.name) like "+ db.pool.escape("%"+parameters.nameContains.toLowerCase()+"%"))
    }

    if(parameters.hasOwnProperty("resources")) {
        joins.push("JOIN ebdb.RoomResourceMeetingRoomAssociation RRMRA  on RRMRA.room = MR.id");
        joins.push("JOIN ebdb.RoomResource RR on RRMRA.resource = RR.id");
        constraints.push("RR.name = " + db.pool.escape(parameters.resources));
    }

    if(parameters.hasOwnProperty("availableFrom") && parameters.hasOwnProperty("availableTo")) {

        const availableFrom = db.pool.escape(db.formatDatetime(parameters.availableFrom));
        const availableTo = db.pool.escape(db.formatDatetime(parameters.availableTo));

        let sql = "MR.id not in ( SELECT DISTINCT MR.id from ebdb.MeetingRoom MR";
        sql += " JOIN ebdb.Meeting M on M.room_name = MR.name";
        sql += " WHERE (M.start_datetime >= "+ availableFrom +" AND M.end_datetime >= "+ availableTo + ")";
        sql += " OR (M.start_datetime < "+ availableFrom +" AND M.end_datetime > "+ availableFrom +")";
        sql += " OR (M.start_datetime < "+ availableTo +" AND M.end_datetime > "+ availableTo +"))";

        constraints.push(sql);
    }

    if(joins.length > 0 ) {
        selectSQL += " " + joins.join(" ");
    }

    if(constraints.length > 0) {
        selectSQL += " WHERE " + constraints.join(" AND ");
    }

    let connection, object;
    return db.pool.getConnection()
        .then(conn => {connection = conn; return conn.query(selectSQL)})
        .then(results => { return getMany(results, roomFormatter)})
        .then(obj => { object = obj; return getResourcesForRoomsByRoomId(connection, obj.value.items.map(r => r.roomId))})
        .then(roomResources => { return addResourcesToRooms(object.value.items, roomResources.value.items) })
        .then(() => { return finish(object); })
        .catch((err) => { return getError(err)})
        .finally(() => { if(connection) { connection.release(); }});
};

const getMeetingsByRoomResponse = function (results) {
    return new Promise(function (resolve, reject) {
        if (results.length === 0) {
            resolve({status: "NOT FOUND"});
        } else {
            console.log(results);
            resolve({status: "OK", result: { meetings: results}});
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
        .catch(err => { return getError(err.message)})
        .finally(() => { if(connection) { connection.release(); }});
};

exports.createRoom = function (room) {

    const calendarName = room.name + "'s Meeting Room Calendar" || "";

    const calendarSql = "INSERT INTO ebdb.Calendar (name) VALUES (?);";

    const roomSql = "INSERT INTO ebdb.MeetingRoom (name, calendar) VALUES (?, ?);";

    const addRoomResourceSql = "INSERT IGNORE INTO ebdb.RoomResource (name) VALUES (?)";

    let associationResouresSql = "INSERT IGNORE INTO ebdb.RoomResourceMeetingRoomAssociation (room, resource)";
    associationResouresSql += " SELECT ?, id FROM ebdb.RoomResource WHERE name in (?);";

    let connection, object, roomResults;
    return db.pool.getConnection()
        .then(conn => {connection = conn; return conn.query(calendarSql, [calendarName])})
        .then(calendarResults => { return connection.query(roomSql, [room.name, calendarResults.insertId])})
        .then(r => { roomResults = r; return getCreated(r, room.name); })
        .then(obj => { object = obj; return connection.query(addRoomResourceSql, room.resources)})
        .then((r) => { return connection.query(associationResouresSql,[roomResults.insertId, room.resources])})
        .then((r) => { return finish(object)})
        .catch(err => { return getError(err) })
        .finally(() => { if(connection) { connection.release(); }});
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

const userFormatter = function (result) {

    return {
        userId: result.id,
        givenName: result.given_name || null,
        familyName: result.family_name || null,
        email: result.email
    }
};

exports.getUserById = function (userId) {
    const sql = "SELECT * FROM ebdb.User WHERE id = " + db.pool.escape(userId);
    let connection;
    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(sql); })
        .then(results => { return getOne(results, userFormatter)})
        .finally(() => { if(connection) { connection.release(); }});
};

exports.getUserByEmail = function(email) {
    const sql = "SELECT * FROM ebdb.User WHERE email = " + db.pool.escape(email);
    let connection;
    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(sql); })
        .then(results => { return getOne(results, userFormatter())})
        .finally(() => { if(connection) { connection.release(); }});
};

const meetingsByUserFormatter = function(userId, meetings) {
    return new Promise(function (resolve, reject) {
        resolve({status: "OK", value: { userId: userId, meetings: meetings}});
    });
};

const getOrganizersForMeetings = function (conn, meetings) {

    let sql = "SELECT DISTINCT U.id as userId, U.email , M2.id as meetingId from ebdb.Meeting M";
    sql += " JOIN ebdb.Meeting M2 on M2.organizing_event = M.id";
    sql += " JOIN ebdb.Calendar C on M.calendar = C.id";
    sql += " JOIN ebdb.User U on C.id = U.primary_calendar";
    sql += " WHERE M2.id in (?)";
    sql += " UNION";
    sql += " SELECT DISTINCT U.id as userId, U.email, M.id as meetingId from ebdb.Meeting M";
    sql += " JOIN ebdb.User U On U.primary_calendar = M.calendar";
    sql += " WHERE M.id in (?) and M.organizing_event IS NULL";

    return conn.query(sql, [meetings.map(m => m.meetingId), meetings.map(m => m.meetingId)])
        .then(results => { return getMany(results)})
        .catch(err => { return getError(err)});
};

const addUsersToMeetings = function(meetings, userMap) {
    return new Promise(function (resolve, reject) {
        for(let i = 0; i < userMap.length; i++) {
            const meeting = meetings.find(m => m.meetingId === userMap[i].meetingId);
            const userEmail = userMap[i].email || null;
            if(userEmail && meeting) {
                meeting.participants.push(userEmail);
            }
        }
        resolve(meetings);
    });
};

const getParticipantsForMeetings = function(conn, meetings) {

    let sql = "SELECT DISTINCT U.id as userId, U.email, M.id as meetingId from ebdb.Meeting M";
    sql += " JOIN ebdb.Meeting M2 on M.organizing_event = M2.id";
    sql += " JOIN ebdb.Meeting M3 on M3.organizing_event = M2.id";
    sql += " JOIN ebdb.Calendar C on M3.calendar = C.id";
    sql += " JOIN ebdb.User U on C.id = U.primary_calendar";
    sql += " WHERE M.id in (?)";
    sql += " UNION";
    sql += " SELECT DISTINCT U.id as userId, U.email, M2.id as meetingId from ebdb.Meeting M";
    sql += " JOIN ebdb.Meeting M2 on M.organizing_event = M2.id";
    sql += " JOIN ebdb.Meeting M3 on M3.organizing_event = M2.id";
    sql += " JOIN ebdb.Calendar C on M3.calendar = C.id";
    sql += " JOIN ebdb.User U on C.id = U.primary_calendar";
    sql += " WHERE M2.id in (?)";

    return conn.query(sql, [meetings.map(m => m.meetingId), meetings.map(m => m.meetingId)])
        .then(results => { return getMany(results)})
        .catch(err => { return getError(err)});
};

exports.getMeetingsByUser = function (userId) {

    let sql = "SELECT M.* FROM ebdb.Meeting M";
    sql += " JOIN ebdb.Calendar C ON M.calendar = C.id";
    sql += " JOIN ebdb.User U on C.id = U.primary_calendar";
    sql += " WHERE U.id = " + db.pool.escape(userId);

    let connection, object;
    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(sql); })
        .then(results => { return getMany(results, meetingFormatter)})
        .then(obj => { object = obj; return getOrganizersForMeetings(connection, obj.value.items)})
        .then(results => { return addUsersToMeetings(object.value.items, results.value.items)})
        .then(() => { return getParticipantsForMeetings(connection, object.value.items)})
        .then((results) => { return addUsersToMeetings(object.value.items, results.value.items)})
        .then(() => { return meetingsByUserFormatter(userId, object.value.items)})
        .then(obj => { return finish(obj); })
        .catch(err => { return getError(err)})
        .finally(() => { if(connection) { connection.release(); }});
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

    console.log(db.formatQuery(selectSQL));

    let connection;
    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(selectSQL)})
        .then(results => { return getMany(results, userFormatter)})
        .then(users => { return finish(users); })
        .finally(() => { if(connection) { connection.release(); }});
};

exports.createUser = function (request) {

    const user = {
        email: request.email || null,
        givenName: request.givenName || null,
        familyName: request.familyName || null,
        calendarName: request.givenName + "'s Meeting Room Calendar" || null
    };

    //create user's calendar, then create the user
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
    //delete calendar then delete user
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

exports.meetingSuggestion = function(obj) {

    var participants = obj.participants || [];
    var resources = obj.resources || [];
    var duration = obj.duration || "1H";

    //using ADDDATE(CURDATE(), 4) just to limit the amount of meetings to search through later
    var getRoomMeetingsSql = "SELECT room_name, GROUP_CONCAT(DISTINCT start_datetime, '|', end_datetime SEPARATOR '|') AS meetingTimes FROM ebdb.Meeting "
                      + "WHERE start_datetime >= CURDATE() AND end_datetime <= ADDDATE(CURDATE(), 4) ";
    if(resources.length != 0) { //only filter more if employee asks for a room with resources
        getRoomMeetingsSql += "AND room_name IN (SELECT MR.name FROM ebdb.MeetingRoom AS MR, ebdb.RoomResourceMeetingRoomAssociation AS A, ebdb.RoomResource AS RR "
                            + "WHERE MR.id = A.room AND A.resource = RR.id and RR.name IN (?)) ";
    }   
    getRoomMeetingsSql += "GROUP BY room_name;";

    //rooms without any meetings will be included
    var getOtherRoomsSql = "SELECT DISTINCT MR.name FROM ebdb.MeetingRoom AS MR, ebdb.RoomResourceMeetingRoomAssociation AS A, ebdb.RoomResource AS RR "
                           + "WHERE MR.name NOT IN (SELECT DISTINCT room_name FROM ebdb.Meeting "
                           + "WHERE start_datetime >= CURDATE() AND end_datetime <= ADDDATE(CURDATE(), 4))";
    if(resources.length != 0) {
        getOtherRoomsSql += " AND MR.id = A.room AND A.resource = RR.id and RR.name IN (?)";
    }
    getOtherRoomsSql += ";";
    
    //get the meetings of all rooms between curdate() and the next 4 days
    var getMeetingSql = "SELECT DISTINCT start_datetime, end_datetime FROM ebdb.Meeting WHERE start_datetime >= CURDATE() AND end_datetime <= ADDDATE(CURDATE(), 4) AND "
                        + "calendar IN (SELECT primary_calendar FROM ebdb.User WHERE email IN (?)) ORDER BY end_datetime;";

    let connection;
    let roomMeetings;
    let otherRooms;
    return db.pool.getConnection()
        .then(conn => { connection = conn; return conn.query(getRoomMeetingsSql, [resources])})
        .then(results => { roomMeetings = results; return connection.query(getOtherRoomsSql, [resources])})
        .then(results => { otherRooms = results; return connection.query(getMeetingSql, [participants])})
        .then(results => { return createTimetable(timetableFormatter(results, obj), otherRooms) })
        .then(timetable => { return getUserAvailableTimes(timetable)})
        .then(userTimes => { return createRoomSuggestions(userTimes, roomMeetings)})
        .then(userTimes => { return getSuggestions(userTimes, duration)})
        .then(obj => { return finish(obj)})
        .catch(err => { return getError(err)})
        .finally(() => { if(connection) { connection.release(); }});
};

const timetableFormatter = function(results, obj) {
    return {
        meetings: results,
        numDaysAhead: obj.numDaysAhead || null,
        startTime: obj.startTime || null,
        endTime: obj.endTime || null
    }
};

//create time interval data structure to use for checking availability
const createTimetable = function(obj, otherRooms) {
    return new Promise(function(resolve, reject) {

        var meetings = obj.meetings || null;
        var numDaysAhead = obj.numDaysAhead || 3; //default search ahead 3 days
        var startTime = obj.startTime || 7; //default start at 7AM
        var endTime = obj.endTime || 17; //default end at 5PM

        //get current date info
        var currDate = new Date();
        var currHour = currDate.getHours();
        var currMin = currDate.getMinutes();

        currDate.setSeconds(0);
        currDate.setMilliseconds(0);


        //if weekend, or friday after endTime, start searching monday at startTime
        if(currDate.getDay() == 6 || currDate.getDay == 0 ||
           (currDate.getDay() == 5 && currDate.getHours() >= endTime)) {
          if(currDate.getDay() == 6) {
            currDate.setDate(currDate.getDate() + 2);
          }
          else if(currDate.getDay() === 0) {
            currDate.setDate(currDate.getDate() + 1);
          }
          else {
            currDate.setDate(currDate.getDate() + 3);
          }
          currHour = startTime;
          currMin = 0;
          currDate.setHours(startTime);
          currDate.setMinutes(0);
        }

        //round up to the nearest 30 min
        if(currMin > 30) {
          currMin = 0;
          currHour++;
          if(currHour == 24) {
            currHour = 0;
          }
          currDate.setHours(currHour);
          currDate.setMinutes(currMin);

        }
        else if(currMin < 30 && currMin != 0) {
          currMin = 30;
          currDate.setHours(currHour);
          currDate.setMinutes(currMin);
        }

        //if before startTime, set to startTime
        if(currHour < startTime) {
            currHour = startTime;
            currMin = 0;
            currDate.setHours(startTime);
            currDate.setMinutes(0);
        }

        var timetable = [];

        var workhours = endTime - startTime;
        for(var i = 0; i < workhours*2*numDaysAhead; i++) { //*2 (for half hour intervals) * numDaysAhead to look
          //if past endTime, go to startTime the next day
          if(currHour >= endTime) {
            currHour = startTime;
            currMin = 0;
            currDate.setHours(currHour);
            currDate.setMinutes(currMin);
            currDate.setDate(currDate.getDate()+1);
          }

          var endDateTime = new Date(currDate.getTime());
          //increment in half hour intervals
          if(currMin == 30) {
            endDateTime.setHours(currHour + 1);
            endDateTime.setMinutes(0);
          }
          else {
            endDateTime.setMinutes(30);
          }

          var otherRoomNames = [];
          for(var t = 0; t < otherRooms.length; t++) {
            otherRoomNames.push(otherRooms[t].name);
          }

          var timeslot = {
            startDateTime: currDate.toISOString(),
            endDateTime: endDateTime,
            rooms: otherRoomNames,
            available: 0
          };

          var x = 0;
          //iterate through all meetings. if we find a meeting that conflicts, set that to busy (1)
          //if we don't, then the time is open/free
          while(x < meetings.length) {

            var meetingObj = {
                start: (new Date(meetings[x].start_datetime)).getTime(),
                end: (new Date(meetings[x].end_datetime)).getTime()
            };

            var timeSlotObj = {
                start: (new Date(currDate.toISOString())).getTime(),
                end: (new Date(endDateTime.toISOString())).getTime()
            };

            //if time is between a meeting, set timeslot.avalable to 1 (busy)
            if(checkMeetingIntersect(meetingObj, timeSlotObj)) {
                timeslot.available = 1;
            }
            x++;
          }
          timetable.push(timeslot);

          //increment in half hour intervals
          if(currMin == 30) {
            currMin = 0;
            currHour++;
            currDate.setHours(currHour);
            currDate.setMinutes(currMin);
          }
          else {
            currMin = 30;
            currDate.setMinutes(currMin);
          }

        }

        resolve(timetable);
    });
};

const getUserAvailableTimes = function(timetable) {
    return new Promise(function(resolve, reject) {
        let times = [];
        //iterate through timetable and find all available timeslots
        for(var i = 0; i < timetable.length; i++) {
            if(timetable[i].available == 0) {
                times.push(timetable[i]);
            }
        }
        resolve(times);
    });
};

const createRoomSuggestions = function(userTimes, roomMeetings) {

    return new Promise(function(resolve, reject) {
        for(var x = 0; x < userTimes.length; x++) {
            var timeSlot = userTimes[x];
            for(var y = 0; y < roomMeetings.length; y++) {
                var room = roomMeetings[y];
                var roomName = room.room_name;
                var meetingTimes = (room.meetingTimes).split("|");
                timeSlot.rooms.push(roomName);
                for(var i = 0; i < meetingTimes.length - 1; i+=2) {

                    var meetingObj = {
                        start: (new Date(meetingTimes[i])).getTime(),
                        end: (new Date(meetingTimes[i+1])).getTime()
                    };

                    var timeSlotObj = {
                        start: (new Date(timeSlot.startDateTime)).getTime(),
                        end: (new Date(timeSlot.endDateTime)).getTime()
                    };

                    if(checkMeetingIntersect(meetingObj, timeSlotObj)) {
                        timeSlot.rooms.pop();
                        break;
                    }

                }


            }
        }
        resolve(userTimes);
    });

};

//given a meeting obj (start/end datetime) and a timeSlot obj (start/end datetime)
//return true if they overlap, else false
const checkMeetingIntersect = function(meetingObj, timeSlotObj) {
    var meetingStart = (new Date(meetingObj.start)).getTime();
    var meetingEnd =(new Date(meetingObj.end)).getTime();
    var timeSlotStart = (new Date(timeSlotObj.start)).getTime();
    var timeSlotEnd = (new Date(timeSlotObj.end)).getTime();

    if((meetingStart >= timeSlotStart && meetingStart < timeSlotEnd) 
    || (meetingEnd > timeSlotStart && meetingEnd <= timeSlotEnd) 
    || (meetingStart <= timeSlotStart && meetingEnd >= timeSlotEnd)) {

        return true;
    }
    else {
        return false;
    }
};

const getSuggestions = function(userTimes, duration) {
    return new Promise(function(resolve, reject) {
        //parse duration
        const days = duration.match(/\d+D/g) || "0D";
        const hours = duration.match(/\d+H/g) || "0H";
        const mins = duration.match(/\d+M/g) || "0M";

        let obj = {};

        if(hours) {
            obj.hours = parseInt(String(hours).slice(0, -1));
        }

        if(mins) {
            obj.minutes = parseInt(String(mins).slice(0, -1));
        }

        if(days > 0 || obj.hours >= 4) {
            obj.hours = 4;
            obj.minutes = 0;
        }

        console.log(obj);

        //number of consecutive timeslots needed
        var slotsToCount = obj.hours * 2 + Math.ceil(obj.minutes / 30); 
        console.log(slotsToCount);

        let countTimes = 0; //number of suggestions
        let suggestions = []; //list of timeslot objects
        let currentSlotCount = 0; //counter for number of consecutive timeslots

        //iterate through timetable and find first 5 suggestions
        for(var i = 0; i < userTimes.length; i++) {
            var timeSlot = userTimes[i];
            if(countTimes == 5) {
                break;
            }
            if((timeSlot.rooms).length != 0) {
                var timeSlotStart = timeSlot.startDateTime;
                currentSlotCount = 1;
                var roomSugg = timeSlot.rooms;
                //console.log(roomSugg);
                //need to find consecutive timeslots open
                for(var j = i+1; j < userTimes.length; j++) {
                    var previousEndTime = new Date(userTimes[j-1].endDateTime).getTime();
                    var currentStartTime = new Date(userTimes[j].startDateTime).getTime();

                    //if we have a suggestion with rooms that is in succession of the prev time
                    if(userTimes[j].rooms.length != 0 && previousEndTime == currentStartTime) {
                        //take the intersection of the rooms
                        roomSugg = roomSugg.filter(function(n) {
                            return (userTimes[j].rooms).indexOf(n) > -1;
                        });
                        //console.log(roomSugg);
                        //if the resulting intersect is empty, stop
                        if(roomSugg.length == 0) {
                            break;
                        }
                        currentSlotCount++;
                        //if we reached our goal, add it to the list
                        if(currentSlotCount == slotsToCount) {
                            countTimes++;
                            var suggestion = {
                                startDateTime: timeSlotStart,
                                endDateTime: userTimes[j].endDateTime,
                                rooms: roomSugg
                            };
                            suggestions.push(suggestion);
                            break;
                        }
                    }
                    else {
                        break;
                    }
                        
                }
                currentSlotCount = 0;
            }
        }
        resolve(suggestions);
    });
};
