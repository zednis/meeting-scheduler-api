'use strict';
var AWS = require('aws-sdk');
var express = require('express');
var bodyParser = require('body-parser');
var Promise = require('promise');
var mysql = require('mysql');

// AWS.config.region = process.env.REGION;

var app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('etag', false);

var port = process.env.PORT || 3000;

//sets up a pool of 10 connections to the DB
var pool = mysql.createPool({
    connectionLimit : 10,
    host            : process.env.RDS_HOSTNAME,
    user            : process.env.RDS_USERNAME,
    password        : process.env.RDS_PASSWORD,
    port            : process.env.RDS_PORT
});

// test the connection to the DB
var testConnection = new Promise(function(resolve, reject) {

    return pool.getConnection(function(err, connection) {
        if (err) {
            console.error(err);
            resolve(false);
        }

        console.log("successfully connected to database!");
        connection.release();
        resolve(true);
    });
});

app.get('/', function (req, res) {
    res.json({message: "hello world!"});
});

app.get('/dbStatus', function (req, res) {
    testConnection
        .then(function(result){
            var db_status_msg = (result) ? "ok" : "down";
            res.json({databaseConnection: db_status_msg});
        })
        .catch(function(err){
            res.json({databaseConnection: "error"});
        });
});

var server = app.listen(port, function () {
    console.log('Server running at http://127.0.0.1:' + port + '/');
});

//initial meeting endpoints

//create a meeting
app.post("/meeting", function (req, res) {
    var name = req.body.name || null;
    var startDateTime = req.body.startDateTime || null;
    var endDateTime = req.body.endDateTime || null;
    

    //console.log(req);
    console.log(req.body);

    var sql = "INSERT INTO ebdb.Meeting (name, startDateTime, endDateTime) VALUES (?, ?, ?);";
    var inserts = [name, startDateTime, endDateTime];
    mysql.format(sql, inserts);

    console.log(mysql.format(sql, inserts));

    pool.query(sql, inserts, function(error, results, fields) {
        // console.log(results);
        // console.log(results[0]);
        // console.log(error);
        // console.log(fields);
        if(error) {
            res.statusCode = 500;
            console.log(error);
            res.json({
              "requestURL":  "/meeting",
              "action": "post",
              "status": 500,
              "message": "Query failed",
              "timestamp": new Date()
            });
        }
        else {
            res.statusCode = 201;
            res.setHeader("Location", "/meeting/" + results.insertId);
            res.json({
              "requestURL":  "/meeting",
              "action": "post",
              "status": 201,
              "message": "Meeting created successfully",
              "timestamp": new Date()
            });
        }
    });

});


//retrieving a meeting
app.get("/meeting/:meetingId", function (req, res) {
    var meetingId = req.params.meetingId;

    var sql = "SELECT * FROM ebdb.Meeting WHERE id = " + pool.escape(meetingId);
    pool.query(sql, function(error, results, fields) {
        console.log(results);
        if(error) {
            console.warn("Query failed");
            res.statusCode = 500;
            res.json({
              "requestURL":  "/meeting/" + meetingId,
              "action": "get",
              "status": 500,
              "message": "Query failed",
              "timestamp": new Date()
            });
        }
        else {
            if(results.length == 1) {
              res.statusCode = 200;
              //console.log(results[0]);
              res.send(results[0]);
            } else if (results.length == 0) {
              res.statusCode = 404;
              res.json({
                "requestURL":  "/meeting/" + meetingId,
                "action": "get",
                "status": 404,
                "message": "Meeting not found",
                "timestamp": new Date()
              });
            } else {
              // this should never happen since we are selecting on the primary key
              console.warn("Multiple meetings returned with meetingId: "+ meetingId);
              res.statusCode = 500;
              res.json({
                "requestURL":  "/meeting/" + meetingId,
                "action": "get",
                "status": 500,
                "message": "Multiple meetings found",
                "timestamp": new Date()
              });
            }
        }

    });
});


//update a meeting
app.put("/meeting/:meetingId", function (req, res) {
    var meetingId = req.params.meetingId;
    var name = req.body.name || null;
    var startDateTime = req.body.startDateTime || null;
    var endDateTime = req.body.endDateTime || null;

    var sql = "UPDATE ebdb.Meeting";

    var setAlreadyFlag = false; //becomes true if one of the fields has been set

    var sqlInserts = {
        name: name, 
        startDateTime: startDateTime, 
        endDateTime: endDateTime
    };

    //console.log(sqlInserts)

    for(var x in sqlInserts) {
        if(sqlInserts[x]) {
            sql += (setAlreadyFlag) ? ", " : " SET ";
            setAlreadyFlag = true;
            sql += " " + x + " = " + pool.escape(sqlInserts[x]);
        }
    }

    sql += " WHERE id = " + pool.escape(meetingId);

    //console.log(sql);

    pool.query(sql, function(error, results, fields) {
        //console.log("Results: \n");
        //console.log(results);
        if(error) {
            console.warn("Query failed");
            res.statusCode = 500;
            res.json({
              "requestURL":  "/meeting/" + meetingId,
              "action": "put",
              "status": 500,
              "message": "Query failed",
              "timestamp": new Date()
            });
        }
        else {
            if(results.affectedRows != 0) {
              res.statusCode = 200;
              res.json({
                "requestURL":  "/meeting/" + meetingId,
                "action": "put",
                "status": 200,
                "message": "Meeting updated successfully",
                "timestamp": new Date()
              });
            } else { //if (results.affectedRows == 0) {
              res.statusCode = 404;
              res.json({
                "requestURL":  "/meeting/" + meetingId,
                "action": "put",
                "status": 404,
                "message": "Meeting not found",
                "timestamp": new Date()
              });
          }
        }
    });


});


//delete a meeting
app.delete("/meeting/:meetingId", function (req, res) {
    
    var meetingId = req.params.meetingId;

    var sql = "DELETE FROM ebdb.Meeting WHERE id = " + pool.escape(meetingId);
    pool.query(sql, function(error, results, fields) {
        if(error) {
            console.warn("Query failed");
            res.statusCode = 500;
            res.json({
              "requestURL":  "/meeting/" + meetingId,
              "action": "delete",
              "status": 500,
              "message": "Query failed",
              "timestamp": new Date()
            });
        }
        else {
            if(results.affectedRows != 0) {
              res.statusCode = 200;
              res.json({
                "requestURL":  "/meeting/" + meetingId,
                "action": "delete",
                "status": 200,
                "message": "Meeting deleted successfully",
                "timestamp": new Date()
              });
            } else { //if (results.affectedRows == 0) {
              res.statusCode = 404;
              res.json({
                "requestURL":  "/meeting/" + meetingId,
                "action": "delete",
                "status": 404,
                "message": "Meeting not found",
                "timestamp": new Date()
              });
          }
        }
    });
});


//initial user endpoints


//create a user
app.post("/user", function (req, res) {
    var email = req.body.email || null;
    var givenName = req.body.givenName || null;
    var familyName = req.body.familyName || null;
    

    //console.log(req);
    console.log(req.body);

    var sql = "INSERT INTO ebdb.User (email, given_name, family_name) VALUES (?, ?, ?);";

    //primary_calendar_fk remains null. would have to do an additional nested query to update it.

    var inserts = [email, givenName, familyName];
    mysql.format(sql, inserts);

    console.log(mysql.format(sql, inserts));

    //create user w given params
    pool.query(sql, inserts, function(error, results, fields) {
        // console.log(results);
        // console.log(results[0]);
        // console.log(error);
        // console.log(fields);
        if(error) {
            res.statusCode = 500;
            console.log(error);
            res.json({
              "requestURL":  "/user",
              "action": "post",
              "status": 500,
              "message": "Query failed",
              "timestamp": new Date()
            });
        }
        else {
            var calendarName = givenName + "'s Primary Calendar";
            var userFk = results.insertId;
            var calendarSql = "INSERT INTO ebdb.Calendar (name, user_fk) VALUES (?, ?);";
            var calendarInserts = [calendarName, userFk];


            //create calendar for the user
            pool.query(calendarSql, calendarInserts, function(error1, results1, fields1) {
              if(error1) {
                  res.statusCode = 500;
                  console.log(error1);
                  res.json({
                    "requestURL":  "/user",
                    "action": "post",
                    "status": 500,
                    "message": "Query failed",
                    "timestamp": new Date()
                  });
              }
              else {
                res.statusCode = 201;
                res.setHeader("Location", "/user/" + userFk);
                res.json({
                  "requestURL":  "/user",
                  "action": "post",
                  "status": 201,
                  "message": "User created successfully",
                  "timestamp": new Date()
                });
              }
            });
        }
    });

});


//retrieving a user
app.get("/user/:userId", function (req, res) {
    var userId = req.params.userId;

    var sql = "SELECT * FROM ebdb.User WHERE id = " + pool.escape(userId);
    pool.query(sql, function(error, results, fields) {
        console.log(results);
        if(error) {
            console.warn("Query failed");
            res.statusCode = 500;
            res.json({
              "requestURL":  "/user/" + userId,
              "action": "get",
              "status": 500,
              "message": "Query failed",
              "timestamp": new Date()
            });
        }
        else {
            if(results.length == 1) {
              res.statusCode = 200;
              //console.log(results[0]);
              res.send(results[0]);
            } else if (results.length == 0) {
              res.statusCode = 404;
              res.json({
                "requestURL":  "/user/" + userId,
                "action": "get",
                "status": 404,
                "message": "User not found",
                "timestamp": new Date()
              });
            } else {
              // this should never happen since we are selecting on the primary key
              console.warn("Multiple Users returned with userId: "+ userId);
              res.statusCode = 500;
              res.json({
                "requestURL":  "/user/" + userId,
                "action": "get",
                "status": 500,
                "message": "Multiple users found",
                "timestamp": new Date()
              });
            }
        }

    });
});


//update a user
app.put("/user/:userId", function (req, res) {
    var userId = req.params.userId;
    var email = req.body.email || null;
    var givenName = req.body.givenName || null;
    var familyName = req.body.familyName || null;

    var sql = "UPDATE ebdb.User";

    var setAlreadyFlag = false; //becomes true if one of the fields has been set

    var sqlInserts = {
        email: email, 
        given_name: givenName, 
        family_name: familyName
    };

    //console.log(sqlInserts)

    for(var x in sqlInserts) {
        if(sqlInserts[x]) {
            sql += (setAlreadyFlag) ? ", " : " SET ";
            setAlreadyFlag = true;
            sql += " " + x + " = " + pool.escape(sqlInserts[x]);
        }
    }

    sql += " WHERE id = " + pool.escape(userId);

    console.log(sql);

    pool.query(sql, function(error, results, fields) {
        //console.log("Results: \n");
        //console.log(results);
        if(error) {
            console.warn("Query failed");
            res.statusCode = 500;
            res.json({
              "requestURL":  "/user/" + userId,
              "action": "put",
              "status": 500,
              "message": "Query failed",
              "timestamp": new Date()
            });
        }
        else {
            if(results.affectedRows != 0) {
              res.statusCode = 200;
              res.json({
                "requestURL":  "/user/" + userId,
                "action": "put",
                "status": 200,
                "message": "User updated successfully",
                "timestamp": new Date()
              });
            } else { //if (results.affectedRows == 0) {
              res.statusCode = 404;
              res.json({
                "requestURL":  "/user/" + userId,
                "action": "put",
                "status": 404,
                "message": "User not found",
                "timestamp": new Date()
              });
          }
        }
    });


});


//delete a user
app.delete("/user/:userId", function (req, res) {
    
    var userId = req.params.userId;

    var calendarSql = "DELETE FROM ebdb.Calendar WHERE user_fk = " + pool.escape(userId);
    
    //delete calendar then user

    pool.query(calendarSql, function(error, results, fields) {
        if(error) {
            console.warn("Calendar query failed");
            console.log(error);
            res.statusCode = 500;
            res.json({
              "requestURL":  "/user/" + userId,
              "action": "delete",
              "status": 500,
              "message": "Query failed for calendar",
              "timestamp": new Date()
            });
        }
        else {
            if(results.affectedRows != 0) {
              var sql = "DELETE FROM ebdb.User WHERE id = " + pool.escape(userId);
              pool.query(sql, function(error1, results1, fields1) {
                  if(error1) {
                      console.warn("User query failed");
                      console.log(error);
                      res.statusCode = 500;
                      res.json({
                        "requestURL":  "/user/" + userId,
                        "action": "delete",
                        "status": 500,
                        "message": "Query failed",
                        "timestamp": new Date()
                      });
                  }
                  else {
                      if(results1.affectedRows != 0) {
                        res.statusCode = 200;
                        res.json({
                          "requestURL":  "/user/" + userId,
                          "action": "delete",
                          "status": 200,
                          "message": "User and their calendar deleted successfully",
                          "timestamp": new Date()
                        });
                      } else { //if (results.affectedRows == 0) {
                        res.statusCode = 404;
                        res.json({
                          "requestURL":  "/user/" + userId,
                          "action": "delete",
                          "status": 404,
                          "message": "User not found",
                          "timestamp": new Date()
                        });
                    }
                  }
              });
            } else { //if (results.affectedRows == 0) {
              res.statusCode = 404;
              res.json({
                "requestURL":  "/user/" + userId,
                "action": "delete",
                "status": 404,
                "message": "Calendar not found for user " + userId,
                "timestamp": new Date()
              });
          }
        }
    });
});







function cleanup() {
    console.log("shutting down");
    server.close(function () {
       pool.end();
       console.log("closed database connection pool");
    });
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);