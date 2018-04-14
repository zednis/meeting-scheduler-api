'use strict';
var AWS = require('aws-sdk');
var express = require('express');
var bodyParser = require('body-parser');
var Promise = require('promise');

var api = require('./api.js');

// AWS.config.region = process.env.REGION;

var app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('etag', false);

var port = process.env.PORT || 3000;

app.get('/', function (req, res) {
    res.json({message: "hello world!"});
});

app.get('/api/dbStatus', function (req, res) {
    api.testConnection
        .then(function(result) {
            const db_status_msg = (result) ? "ok" : "down";
            res.json({databaseConnection: db_status_msg});
        })
        .catch(function(err) {
            res.json({databaseConnection: "error"});
        });
});

var server = app.listen(port, function () {
    console.log('Server running at http://127.0.0.1:' + port + '/');
});

//create a meeting
app.post("/api/meetings", function (req, res) {
    console.log(req.body);
    create(req, res, api.createMeeting, req.body);
});

// retrieving a meeting
app.get("/api/meetings/:meetingId", function (req, res) {
    const meetingId = req.params.meetingId;
    get(req, res, api.getMeetingById, meetingId);
});

// update a meeting
app.put("/api/meetings/:meetingId", function (req, res) {
    const obj = { meetingId: req.params.meetingId, body: req.body };
    update(req, res, api.updateMeeting, obj);
});

// delete a meeting
app.delete("/api/meetings/:meetingId", function (req, res) {
    const meetingId = req.params.meetingId;
    _delete(req, res, api.deleteMeeting, meetingId);
});

// create a user
app.post("/api/users", function (req, res) {
    // TODO verify req body and return status 400 if not valid
    const user = {
        email: req.body.email || null,
        givenName: req.body.givenName || null,
        familyName: req.body.familyName || null,
        calendarName: req.body.givenName + "'s Meeting Room Calendar" || null
    };
    create(req, res, api.createUser, user);
});

// TODO create a meeting on the user's calendar
// app.post("/api/user/:userId/meetings", function (req, res) {
// TODO code me
// });

//retrieving a user
app.get("/api/users/:userId", function (req, res) {
    const userId = req.params.userId;
    get(req, res, api.getUserById, userId);
});

//TODO retrieve a user's meetings, filtered by query parameters
// app.get("/api/user/:userId/meetings", function (req, res) {
// TODO code me
// });

//update a user
app.put("/api/users/:userId", function (req, res) {
    const obj = { userId: req.params.userId, body: req.body };
    update(req, res, api.updateUser, obj);
});

//delete a user
app.delete("/api/users/:userId", function (req, res) {
    const userId = req.params.userId;
    _delete(req, res, api.deleteUser, userId);
});

//create a meeting room
app.post("/api/rooms", function (req, res) {
    create(req, res, api.createRoom, req.body);
});

//retrieving a meeting room
app.get("/api/rooms/:roomName", function (req, res) {
    const roomName = req.params.roomName;
    get(req, res, api.getRoomByName, roomName);
});

//retrieve a list of meeting rooms, filtered by query parameters
app.get("/api/rooms", function (req, res) {
    get(req, res, api.getRooms, req.query);
});

// retrieve a list of meetings for the specified room, filtered by query parameters
app.get("/api/rooms/:roomName/meetings", function (req, res) {
    const roomName = req.params.roomName;
    get(req, res, api.getMeetingsByRoomName, roomName);
});

//update a meeting room
app.put("/api/rooms/:roomName", function (req, res) {
    const obj = { roomId: req.params.roomName, body: req.body };
    update(req, res, api.updateRoom, obj);
});

//delete a meeting room
app.delete("/api/rooms/:roomName", function (req, res) {
   _delete(req, res, api.deleteRoom, req.params.roomName);
});

function _delete(req, res, apicall, parameter) {

    const msg = {
        requestURL: req.originalUrl,
        action: req.method,
        timestamp: new Date()
    };

    apicall(parameter)
        .then(function(result) {
            if(result.itemsDeleted === 0) {
                res.statusCode = 404;
                msg.status = 404;
                res.send(msg);
            } else {
                res.statusCode = 200;
                msg.status = 200;
                res.send(msg);
            }
        })
        .catch(function(err) {
            res.statusCode = 500;
            msg.status = 500;
            res.send(msg);
        });
}

function create(req, res, apicall, object ) {

    const msg = {
        requestURL: req.originalUrl,
        action: req.method,
        timestamp: new Date()
    };

    apicall(object)
        .then(function (result) {
            res.statusCode = 201;
            res.setHeader("Location", req.originalUrl + "/" + encodeURIComponent(result.createdId));
            msg.status = 201;
            msg.created = req.originalUrl + "/" + encodeURIComponent(result.createdId);
            res.send(msg);
        })
        .catch(function (error) {
            res.statusCode = 500;
            msg.status = 500;
            msg.error = error.error;
            res.json(msg);
        });
}

function get(req, res, apicall, parameter) {

    const msg = {
        requestURL: req.originalUrl,
        action: req.method,
        timestamp: new Date()
    };

    apicall(parameter)
        .then(function(result) {
            if(result.status === "FOUND") {
                res.statusCode = 200;
                res.send(result.result);
            } else if (result.status === "NOT FOUND") {
                res.statusCode = 404;
                msg.status = 404;
                res.json(msg);
            }
        })
        .catch(function(err) {
            res.statusCode = 500;
            msg.status = 500;
            res.json(msg);
        });
}

function update(req, res, apicall, object) {

    const msg = {
        requestURL: req.originalUrl,
        action: req.method,
        timestamp: new Date()
    };

    apicall(object)
        .then(function (result) {
            if(result.itemsUpdated === 0) {
                res.statusCode = 404;
                msg.status = 404;
                res.send(msg);
            } else {
                res.statusCode = 200;
                msg.status = 200;
                res.send(msg);
            }
        })
        .catch(function (error) {
            res.statusCode = 500;
            msg.status = 500;
            res.json(msg);
        });
}

function cleanup() {
    console.log("shutting down");
    server.close(function () {
        api.cleanUp();
    });
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);