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


//suggest meeting times given list of participants
app.post("/api/meetingSuggestion", function (req, res) {

    //currently only look 3 days ahead, and assume 7AM - 5PM workday. only search on weekdays

    if(!req.body.participants) {
      res.statusCode = 400;
      console.log();
      res.json({
        "requestURL":  "/room",
        "action": "post",
        "status": 400,
        "message": "Bad Request",
        "timestamp": new Date()
      });
    }

    else {

      var participants = req.body.participants || null;

      //using ADDDATE(CURDATE(), 4) just to limit the amount of meetings to search through later
      var getMeetingSql = "SELECT DISTINCT(start_datetime), end_datetime FROM ebdb.meeting WHERE start_datetime >= CURDATE() AND end_datetime < ADDDATE(CURDATE(), 4) AND "
                         + "calendar IN (SELECT primary_calendar FROM ebdb.user WHERE email IN (?)) ORDER BY end_datetime;";
      var inserts = [participants];

      pool.query(getMeetingSql, inserts, function(error, results, fields) {
        if(error) {
          res.statusCode = 500;
          console.log(error);
          res.json({
            "requestURL":  "/meetingSuggestion",
            "action": "post",
            "status": 500,
            "message": "Query failed for calendar",
            "timestamp": new Date()
          });
        }
        else {
          
          var meetings = results;

          var parameters = {
            meetings: meetings,
            numDaysAhead: req.body.numDaysAhead,
            startTime: req.body.startTime,
            endTime: req.body.endTime
          };

          var timetable = createTimetable(parameters);

          var countTimes = 0;
          var suggestions = [];
          //iterate through timetable and find first 5 suggestions
          for(var time in timetable) {
            if(countTimes == 5) {
              break;
            }
            if(timetable[time] == 0) {
              countTimes++;
              suggestions.push(time);
            }
          }
          //console.log(timetable);
          //console.log(suggestions);
          res.send([meetings, timetable, suggestions]);

        }
      });

    }

});

function createTimetable(parameters) {

    var meetings = parameters.meetings || null;
    //var workdays = parameters.workdays || [1,2,3,4,5]; //list of workdays in the week (0-6)
    var numDaysAhead = parameters.numDaysAhead || 3; //look ahead 3 days
    var startTime = parameters.startTime || 7; //default start at 7AM
    var endTime = parameters.endTime || 17; //default end at 5PM

    //get current date info
    var currDate = new Date();
    var currHour = currDate.getHours();
    var currMin = currDate.getMinutes();

    currDate.setSeconds(0);
    currDate.setMilliseconds(0);

    //round up to the nearest 30 min
    if(currMin > 30) {
      currMin = 0;
      currHour++;
      currDate.setHours(currHour);
      currDate.setMinutes(currMin);

    }
    else {
      currMin = 30;
      currDate.setHours(currHour);
      currDate.setMinutes(currMin);
    }

    //if weekend, or friday after endTime, start searching monday at startTime
    if(currDate.getDay() == 6 || currDate.getDay == 0 ||
       (currDate.getDay() == 5 && currDate.getHour() >= endTime)) {
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

    var timetable = {};

    var workhours = endTime - startTime;
    //search for the next 3 days
    for(var i = 0; i < workhours*2*numDaysAhead; i++) { //*2 (for half hour intervals) * numDaysAhead to look
      //if past endTime, go to startTime the next day
      if(currHour >= endTime) {
        currHour = startTime;
        currMin = 0;
        currDate.setHours(currHour);
        currDate.setMinutes(currMin);
        currDate.setDate(currDate.getDate()+1);
      }

      timetable[currDate.toUTCString()] = 0;

      var x = 0;
      //iterate through all meetings. if we find a meeting that conflicts, set that to busy
      //if we don't, then the time is open/free
      while(x < meetings.length) {
        //i thought i'd be able to cut down on the meetings searched through, but this doesn't work???
        // if((new Date(meetings[x].end_datetime)).getTime() > (new Date(currDate)).getTime()) {
        //   break;
        // }
        //if time is between a meeting, set timetable[time] to 1 (busy)
        if(((new Date(meetings[x].start_datetime)).getTime() <= (new Date(currDate.toUTCString())).getTime()) && 
           ((new Date(meetings[x].end_datetime)).getTime() > (new Date(currDate.toUTCString())).getTime())) {
          //console.log("here");
          timetable[currDate.toUTCString()] = 1;
        }
        x++;
      }

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

    return timetable;
}


function cleanup() {
    console.log("shutting down");
    server.close(function () {
        api.cleanUp();
    });
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
