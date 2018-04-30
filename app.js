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
    create(req, res, api.createUser, req.body);
});

// get a list of users, filtered by query parameters
app.get("/api/users", function (req, res) {
    get(req, res, api.getUsers, req.query);
});

//retrieving a user
app.get("/api/users/:userId", function (req, res) {
    const userId = req.params.userId;
    get(req, res, api.getUserById, userId);
});

// retrieve a user's meetings, filtered by query parameters
app.get("/api/users/:userId/meetings", function (req, res) {
    const userId = req.params.userId;
    get(req, res, api.getMeetingsByUser, userId)
});

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

//retrieve a list of meeting rooms, filtered by query parameters
app.get("/api/rooms", function (req, res) {
    get(req, res, api.getRooms, req.query);
});

//retrieving a meeting room
app.get("/api/rooms/:roomName", function (req, res) {
    const roomName = req.params.roomName;
    get(req, res, api.getRoomByName, roomName);
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

//get meeting suggestions
app.post("/api/meetingSuggestion", function (req, res) {
  suggest(req, res, api.meetingSuggestion, req.body);
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
            msg.error = error.message;
            res.json(msg);
        });
}

function get(req, res, apicall, parameter) {

    const msg = {
        requestURL: req.originalUrl,
        action: req.method,
        timestamp: new Date()
    };

    // 'Access-Control-Allow-Origin': '*',
    // 'Access-Control-Allow-Methods': 'GET'
    
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    
    apicall(parameter)
        .then(function(result) {
            if(result.status === "OK") {
                res.statusCode = 200;
                res.send(result.value);
            } else if (result.status === "NOT FOUND") {
                res.statusCode = 404;
                msg.status = 404;
                res.json(msg);
            }
        })
        .catch(function(err) {
            if(err.status === "NOT FOUND") {
                res.statusCode = 404;
                msg.status = 404;
                res.json(msg);
            }
            else {
                res.statusCode = 500;
                msg.status = 500;
                msg.message = err.message;
                res.json(msg);
            }
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

function suggest(req, res, apicall, object) {
  const msg = {
        requestURL: req.originalUrl,
        action: req.method,
        timestamp: new Date()
    };

    apicall(object)
        .then(function (result) {
            res.statusCode = 200;
            msg.status = 200;
            msg.suggestions = result;
            res.send(msg);
        })
        .catch(function (error) {
            console.log(error);
            res.statusCode = 500;
            msg.status = 500;
            msg.error = error;
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
