'use strict';

var Promise = require('promise');
var db = require('./database');

var exports = module.exports = {};

var mysql = require("mysql");

exports.testConnection = db.testConnection;

exports.cleanUp = function() {
    db.cleanUp();
};

// Meeting operations

const getMeetingObject = function (rows) {
    const obj = { };
    // for (let i = 0; i < rows.length; i++) {
    //     const row = rows[i];
    //     const meeting = obj.meetings.find(e => {return e.name === row.name});
    //     if(meeting === undefined) {
    //         obj.meetings.push({id: row.id, name: row.name, resources: [row.resource_name]});
    //     } else {
    //         meeting.resources.push(row.resource_name);
    //     }
    // }
    return obj;
};

exports.getMeetingById = function (meetingId) {
    const sql = "SELECT * FROM ebdb.Meeting WHERE id = " + db.pool.escape(meetingId);

    return new Promise(function (resolve, reject) {
        db.pool.getConnection()
            .then(function (conn){
                conn.query(sql)
                    .then(function (results) {
                        if (results.length === 1) {
                            // const response = getRoomListObject(rows[0]);
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
    const sql = "INSERT INTO ebdb.Meeting (name, start_datetime, end_datetime, calendar) VALUES (?, ?, ?, ?);";
    const inserts = [
        meeting.name,
        db.formatDatetime(meeting.startDateTime),
        db.formatDatetime(meeting.endDateTime),
        meeting.calendar
    ];

    return new Promise(function (resolve, reject) {
        db.pool.getConnection()
            .then(function (conn) {
                conn.query(sql, inserts)
                    .then(function (results) {
                        resolve({status: "SUCCESS", createdId: results.insertId});
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

// exports.getResourcesForRoom = function(roomName) {
//
//     let sql = "SELECT RR.name from ebdb.RoomResource AS RR";
//     sql += "\tJOIN ebdb.RoomResourceMeetingRoomAssociation RRMRA on RR.id = RRMRA.resource";
//     sql += "\tJOIN ebdb.MeetingRoom MR on RRMRA.room = MR.id";
//     sql += "\twhere MR.name = " + db.pool.escape(roomName);
//
//     return new Promise(function (resolve, reject) {
//         db.pool.getConnection()
//             .then(function (conn) {
//                 conn.query(sql)
//                     .then(function (results) {
//                         resolve({status: "OK", value: results});
//                         conn.release();
//                     })
//                     .catch(function (err) {
//                         console.warn(err);
//                         reject({status: "FAILURE", error: err});
//                         conn.release();
//                     });
//             });
//     });
//
// };

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

    // GET ROOM RESOURCES

    let roomResourcesSQL = "SELECT DISTINCT MR.id, RR.name from ebdb.MeetingRoom MR";
    roomResourcesSQL += "\tJOIN ebdb.RoomResourceMeetingRoomAssociation RRMRA on RRMRA.room = MR.id";
    roomResourcesSQL += "\tJOIN ebdb.RoomResource RR on RRMRA.resource = RR.id";
    roomResourcesSQL += "\tWHERE MR.id in (?)";

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
                                    conn.query(roomResourcesSQL, [room_ids])
                                        .then(function (roomResources) {
                                            for (let i = 0; i < roomResources.length; i++) {
                                                const roomResource = roomResources[i];
                                                const room = response.meetings.find(e => {return e.id === roomResource.id});
                                                room.resources.push(roomResource.name);
                                            }
                                            resolve({status: "FOUND", result: response});
                                            conn.release();
                                        });
                                });
                        }
                    })
                    .catch(function (err) {
                        console.warn(err);
                        reject({status: "FAILURE", error: err});
                        conn.release();
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

exports.getUserById = function (userId) {
    const sql = "SELECT * FROM ebdb.User WHERE id = " + db.pool.escape(userId);
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