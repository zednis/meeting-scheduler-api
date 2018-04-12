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
  if(!req.body.name || !req.body.start_datetime || !req.body.room_name ||
    !req.body.end_datetime || !req.body.participants || 
    !Array.isArray(req.body.participants) || !(req.body.participants).length) {

      res.statusCode = 400;
      console.log();
      res.json({
        "requestURL":  "/meeting",
        "action": "post",
        "status": 400,
        "message": "Bad Request",
        "timestamp": new Date()
      });
  }
  else {
      var name = req.body.name || null;
      var start_datetime = req.body.start_datetime || null;
      var end_datetime = req.body.end_datetime || null;
      var participants = req.body.participants || null;
      var room_name = req.body.room_name || null;

      //TO CHANGE
      var organizerEmail = participants[0];
      participants = req.body.participants.slice(1);

      //console.log("participants: " + participants);

      pool.getConnection(function(err,connection) {
        if(err) {
           console.warn("Failed to get connection from pool");
           res.statusCode = 500;
           res.json({
             "requestURL":  "/meeting",
             "action": "post",
             "status": 500,
             "message": "Failed to getConnection from pool",
             "timestamp": new Date()
           });
        }
        else {
          connection.beginTransaction(function(err) {
            if(err) {
              console.warn("Transaction failed to start");
              res.statusCode = 500;
              res.json({
                "requestURL":  "/meeting",
                "action": "post",
                "status": 500,
                "message": "Transaction failed to start",
                "timestamp": new Date()
              });
            }
            else {

              var checkRoomSql = "SELECT * FROM ebdb.MeetingRoom WHERE name = (?);";
              var checkRoomInserts = [room_name];

              connection.query(checkRoomSql, checkRoomInserts, function(error, results, fields) {
                if(error) {
                    return connection.rollback(function() {
                      res.statusCode = 500;
                      console.log(error);
                      res.json({
                        "requestURL":  "/meeting",
                        "action": "post",
                        "status": 500,
                        "message": "Query failed",
                        "timestamp": new Date()
                      });
                    });
                }
                else if(results.length == 0) {
                  return connection.rollback(function() {
                    res.statusCode = 404;
                    console.log(error);
                    res.json({
                      "requestURL":  "/meeting",
                      "action": "post",
                      "status": 404,
                      "message": "Meeting room not found",
                      "timestamp": new Date()
                    });
                  });
                }
                else if(results.length == 1) {
                  var organizerSql = "SELECT primary_calendar FROM ebdb.User WHERE email = (?);";
                  var organizerInserts = [organizerEmail];

                  connection.query(organizerSql, organizerInserts, function(error, results, fields) {

                      if(error) {
                        return connection.rollback(function() {
                          res.statusCode = 500;
                          console.log(error);
                          res.json({
                            "requestURL":  "/meeting",
                            "action": "post",
                            "status": 500,
                            "message": "Query failed",
                            "timestamp": new Date()
                          });
                        });
                      }
                      else {
                        var orgMeetingSql = "INSERT INTO ebdb.Meeting (name, start_datetime, end_datetime, calendar, organizing_event, room_name) VALUES (?,?,?,?,?,?);";
                        var orgMeetingInserts = [name, start_datetime, end_datetime, results[0].primary_calendar, null, room_name];

                        connection.query(orgMeetingSql, orgMeetingInserts, function(error1, results1, fields1) {
                          if(error1) {
                              return connection.rollback(function() {
                                res.statusCode = 500;
                                console.log(error1);
                                res.json({
                                  "requestURL":  "/meeting",
                                  "action": "post",
                                  "status": 500,
                                  "message": "Query failed",
                                  "timestamp": new Date()
                                });
                              });
                          }
                          else if(participants.length == 0) {
                              connection.commit(function(err) {
                                if(err) {
                                  return connection.rollback(function() {
                                    res.statusCode = 500;
                                    console.log(error1);
                                    res.json({
                                      "requestURL":  "/meeting",
                                      "action": "post",
                                      "status": 500,
                                      "message": "Query failed",
                                      "timestamp": new Date()
                                    });
                                  });
                                }
                                else {
                                  res.statusCode = 201;
                                  res.setHeader("Location", "/meeting/" + results1.insertId);
                                  res.json({
                                    "requestURL":  "/meeting",
                                    "action": "post",
                                    "status": 201,
                                    "message": "Meeting created successfully",
                                    "timestamp": new Date()
                                  });
                                }
                              });
                          }
                          else {
                            var orgEventId = results1.insertId;

                            var participantsSql = "SELECT primary_calendar FROM ebdb.User WHERE email IN (?);";
                            var participantsInserts = [participants];

                            connection.query(participantsSql, participantsInserts, function(error2, results2, fields2) {
                              if(error2) {
                                  return connection.rollback(function() {
                                    res.statusCode = 500;
                                    console.log(error1);
                                    res.json({
                                      "requestURL":  "/meeting",
                                      "action": "post",
                                      "status": 500,
                                      "message": "Query failed",
                                      "timestamp": new Date()
                                    });
                                  });
                              }
                              else {

                               var inserts = [];
                               var participantFks = results2;
                                for(var i = 0; i < participantFks.length; i++) {
                                  inserts.push([name, start_datetime, end_datetime, participantFks[i].primary_calendar, orgEventId, room_name]);
                                }
                                console.log(inserts);

                                var sql = "INSERT INTO ebdb.Meeting (name, start_datetime, end_datetime, calendar, organizing_event, room_name) VALUES ?;";
                                console.log(mysql.format(sql, inserts));

                                //console.log(mysql.format(sql, inserts));

                                connection.query(sql, [inserts], function(error3, results3, fields3) {
                                    // console.log(results);
                                    // console.log(results[0]);
                                    // console.log(error);
                                    // console.log(fields);
                                    if(error3) {
                                        return connection.rollback(function() {
                                          res.statusCode = 500;
                                          console.log(error3);
                                          res.json({
                                            "requestURL":  "/meeting",
                                            "action": "post",
                                            "status": 500,
                                            "message": "Query failed",
                                            "timestamp": new Date()
                                          });
                                        });
                                    }
                                    else {
                                        connection.commit(function(err) {
                                          if(err) {
                                            return connection.rollback(function() {
                                              res.statusCode = 500;
                                              console.log(error1);
                                              res.json({
                                                "requestURL":  "/meeting",
                                                "action": "post",
                                                "status": 500,
                                                "message": "Queries failed to commit",
                                                "timestamp": new Date()
                                              });
                                            });
                                          }
                                          else {
                                            res.statusCode = 201;
                                            res.setHeader("Location", "/meeting/" + orgEventId);
                                            res.json({
                                              "requestURL":  "/meeting",
                                              "action": "post",
                                              "status": 201,
                                              "message": "Meeting created successfully",
                                              "timestamp": new Date()
                                            });
                                          }
                                        });
                                    }
                                });

                              }

                            });

                          }
                        });
                      }
                  });
                }
                else {
                  return connection.rollback(function() {
                    res.statusCode = 404;
                    console.log(error);
                    res.json({
                      "requestURL":  "/meeting",
                      "action": "post",
                      "status": 404,
                      "message": "Multiple meeting rooms with that name were found",
                      "timestamp": new Date()
                    });
                  });
                }
              });
            }
          });
        }
      });
    }
      //console.log(req);
      //console.log(req.body);
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
    var start_datetime = req.body.start_datetime || null;
    var end_datetime = req.body.end_datetime || null;
    var room_name = req.body.room_name || null;

    if(room_name) {
      pool.getConnection(function(err,connection) {
        if(err) {
           console.warn("Failed to get connection from pool");
           res.statusCode = 500;
           res.json({
             "requestURL":  "/meeting",
             "action": "post",
             "status": 500,
             "message": "Failed to getConnection from pool",
             "timestamp": new Date()
           });
        }
        else {
          connection.beginTransaction(function(err) {
            if(err) {
              console.warn("Transaction failed to start");
              res.statusCode = 500;
              res.json({
                "requestURL":  "/meeting",
                "action": "post",
                "status": 500,
                "message": "Transaction failed to start",
                "timestamp": new Date()
              });
            }
            else {
              var checkRoomSql = "SELECT * FROM ebdb.MeetingRoom WHERE name = (?);";
              var checkRoomInserts = [room_name];

              connection.query(checkRoomSql, checkRoomInserts, function(error, results, fields) {
                if(error) {
                  return connection.rollback(function() {
                    res.statusCode = 500;
                    console.log(error);
                    res.json({
                      "requestURL":  "/meeting",
                      "action": "post",
                      "status": 500,
                      "message": "Query failed",
                      "timestamp": new Date()
                    });
                  });
                }
                else if(results.length == 0) {
                  return connection.rollback(function() {
                    res.statusCode = 404;
                    console.log(error);
                    res.json({
                      "requestURL":  "/meeting",
                      "action": "post",
                      "status": 404,
                      "message": "Meeting room not found",
                      "timestamp": new Date()
                    });
                  });
                }
                else if(results.length == 1) {
                  var sql = "UPDATE ebdb.Meeting";
                  var setAlreadyFlag = false; //becomes true if one of the fields has been set

                  var sqlInserts = {
                      name: name, 
                      start_datetime: start_datetime, 
                      end_datetime: end_datetime,
                      room_name: room_name
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
                }
                else {
                  return connection.rollback(function() {
                    res.statusCode = 404;
                    console.log(error);
                    res.json({
                      "requestURL":  "/meeting",
                      "action": "post",
                      "status": 404,
                      "message": "Multiple meeting rooms with that name were found",
                      "timestamp": new Date()
                    });
                  });
                }
              });
            }
          });
        }
      });
    }
    else {
        var sql = "UPDATE ebdb.Meeting";

        var setAlreadyFlag = false; //becomes true if one of the fields has been set

        var sqlInserts = {
            name: name, 
            start_datetime: start_datetime, 
            end_datetime: end_datetime
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
    }


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

    if(!req.body.email || !req.body.given_name || !req.body.family_name) {
      res.statusCode = 400;
      console.log();
      res.json({
        "requestURL":  "/user",
        "action": "post",
        "status": 400,
        "message": "Bad Request",
        "timestamp": new Date()
      });
    }
    else {
      var email = req.body.email || null;
      var given_name = req.body.given_name || null;
      var family_name = req.body.family_name || null;

      var calendarName = given_name + "'s Meeting Room Calendar";
      var calendarSql = "INSERT INTO ebdb.Calendar (name) VALUES (?);";
      var calendarInserts = [calendarName];

       pool.getConnection(function(err,connection) {
        if(err) {
           console.warn("Failed to get connection from pool");
           res.statusCode = 500;
           res.json({
             "requestURL":  "/user",
             "action": "post",
             "status": 500,
             "message": "Failed to getConnection from pool",
             "timestamp": new Date()
           });
        }
        else {
          connection.beginTransaction(function(err) {
            if(err) {
              console.warn("Transaction failed to start");
              res.statusCode = 500;
              res.json({
                "requestURL":  "/user",
                "action": "post",
                "status": 500,
                "message": "Transaction failed to start",
                "timestamp": new Date()
              });
            }
            else {
              //create calendar for the user
              connection.query(calendarSql, calendarInserts, function(error1, results1, fields1) {
                if(error1) {
                    return connection.rollback(function() {
                      res.statusCode = 500;
                      console.log(error1);
                      res.json({
                        "requestURL":  "/user",
                        "action": "post",
                        "status": 500,
                        "message": "Query failed",
                        "timestamp": new Date()
                      });
                    });
                }
                else {
                    var sql = "INSERT INTO ebdb.User (email, given_name, family_name, primary_calendar) VALUES (?, ?, ?, ?);";

                    //primary_calendar remains null. would have to do an additional nested query to update it.

                    var inserts = [email, given_name, family_name, results1.insertId];
                    mysql.format(sql, inserts);

                    console.log(mysql.format(sql, inserts));

                    //create user w given params
                    connection.query(sql, inserts, function(error, results, fields) {
                        // console.log(results);
                        // console.log(results[0]);
                        // console.log(error);
                        // console.log(fields);
                        if(error) {
                            return connection.rollback(function() {
                              res.statusCode = 500;
                              console.log(error1);
                              res.json({
                                "requestURL":  "/user",
                                "action": "post",
                                "status": 500,
                                "message": "Query failed",
                                "timestamp": new Date()
                              });
                            });
                        }
                        else {
                            connection.commit(function(err) {
                              if(err) {
                                return connection.rollback(function() {
                                  res.statusCode = 500;
                                  console.log(error1);
                                  res.json({
                                    "requestURL":  "/user",
                                    "action": "post",
                                    "status": 500,
                                    "message": "Queries failed to commit",
                                    "timestamp": new Date()
                                  });
                                });
                              }
                              else {
                                res.statusCode = 201;
                                res.setHeader("Location", "/user/" + results.insertId);
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

                 }
              }); 
            }
          });
        }
      });
    }
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
  
    if(!req.body.email || !req.body.given_name || !req.body.family_name) {
      res.statusCode = 400;
      console.log();
      res.json({
        "requestURL":  "/user",
        "action": "post",
        "status": 400,
        "message": "Bad Request",
        "timestamp": new Date()
      });
    }
    else {
      var email = req.body.email || null;
      var given_name = req.body.given_name || null;
      var family_name = req.body.family_name || null;

      var sql = "UPDATE ebdb.User";

      var setAlreadyFlag = false; //becomes true if one of the fields has been set

      var sqlInserts = {
          email: email, 
          given_name: given_name, 
          family_name: family_name
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
    }

});


//delete a user
app.delete("/user/:userId", function (req, res) {
    

    var userId = req.params.userId;

    var calendarFkSql = "SELECT * FROM ebdb.User WHERE id = " + pool.escape(userId);

    pool.getConnection(function(err,connection) {
        if(err) {
           console.warn("Failed to get connection from pool");
           res.statusCode = 500;
           res.json({
             "requestURL":  "/user",
             "action": "post",
             "status": 500,
             "message": "Failed to getConnection from pool",
             "timestamp": new Date()
           });
        }
        else {
          connection.beginTransaction(function(err) {
            if(err) {
              console.warn("Transaction failed to start");
              res.statusCode = 500;
              res.json({
                "requestURL":  "/user",
                "action": "post",
                "status": 500,
                "message": "Transaction failed to start",
                "timestamp": new Date()
              });
            }
            else {
              connection.query(calendarFkSql, function(error, results, fields) {
                if(error) {
                    console.warn("Query failed");
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
                  console.log("Results: " + results[0]);
                  var calendarId = results[0].primary_calendar;
                  console.log("ID: " + calendarId);

                  var sql = "DELETE FROM ebdb.User WHERE id = " + pool.escape(userId);
                
                  //delete User then Calendar

                  connection.query(sql, function(error1, results1, fields) {
                      if(error1) {
                          return connection.rollback(function() {
                            console.warn("User query failed");
                            console.log(error);
                            res.statusCode = 500;
                            res.json({
                              "requestURL":  "/user/" + userId,
                              "action": "delete",
                              "status": 500,
                              "message": "Query failed for User",
                              "timestamp": new Date()
                            });
                          });
                      }
                      else {
                          if(results1.affectedRows != 0) {
                             var calendarSql = "DELETE FROM ebdb.Calendar WHERE id = " + connection.escape(calendarId);
                            
                            connection.query(calendarSql, function(error2, results2, fields2) {
                                if(error2) {
                                    return connection.rollback(function() {
                                      console.warn("Calendar query failed");
                                      console.log(error2);
                                      res.statusCode = 500;
                                      res.json({
                                        "requestURL":  "/user/" + userId,
                                        "action": "delete",
                                        "status": 500,
                                        "message": "Query failed for Calendar",
                                        "timestamp": new Date()
                                      });
                                    });
                                }
                                else {
                                    if(results2.affectedRows != 0) {
                                      connection.commit(function(err) {
                                        if(err) {
                                          return connection.rollback(function() {
                                            console.warn("Commit failed");
                                            console.log(error2);
                                            res.statusCode = 500;
                                            res.json({
                                              "requestURL":  "/user/" + userId,
                                              "action": "delete",
                                              "status": 500,
                                              "message": "Commit failed",
                                              "timestamp": new Date()
                                            });
                                          });
                                        }
                                        else {
                                          res.statusCode = 200;
                                          res.json({
                                            "requestURL":  "/user/" + userId,
                                            "action": "delete",
                                            "status": 200,
                                            "message": "User and their calendar deleted successfully",
                                            "timestamp": new Date()
                                          });
                                        }
                                      });
                                      
                                    } else { //if (results.affectedRows == 0) {
                                      return connection.rollback(function() {
                                        res.statusCode = 404;
                                        res.json({
                                          "requestURL":  "/user/" + userId,
                                          "action": "delete",
                                          "status": 404,
                                          "message": "Calendar not found",
                                          "timestamp": new Date()
                                        });
                                      });
                                  }
                                }
                            });
                          } else { //if (results.affectedRows == 0) {
                            return connection.rollback(function() {
                              res.statusCode = 404;
                              res.json({
                                "requestURL":  "/user/" + userId,
                                "action": "delete",
                                "status": 404,
                                "message": "User not found" ,
                                "timestamp": new Date()
                              });
                            });
                          }
                      }
                  });
                }
              });
            }
          });
        }
    });
});

// meeting room endpoints

//create a meeting room
app.post("/room", function (req, res) {

    if(!req.body.name) {
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

      var name = req.body.name || null;

      var calendarName = name + "'s Meeting Room Calendar";
      var calendarSql = "INSERT INTO ebdb.Calendar (name) VALUES (?);";
      var calendarInserts = [calendarName];

      pool.getConnection(function(err, connection) {
        if(err) {
          res.statusCode = 500;
          console.log();
          res.json({
            "requestURL":  "/room",
            "action": "post",
            "status": 500,
            "message": "Failed to getConnection from pool",
            "timestamp": new Date()
          });
        }
        else {
          connection.beginTransaction(function(err) {
            if(err) {
              res.statusCode = 500;
              console.log(error);
              res.json({
                "requestURL":  "/room",
                "action": "post",
                "status": 500,
                "message": "Transaction failed to start",
                "timestamp": new Date()
              });
            }
            else {
              //create calendar for the meeting room
              connection.query(calendarSql, calendarInserts, function(error, results, fields) {
                if(error) {
                    return connection.rollback(function() {
                      res.statusCode = 500;
                      console.log(error);
                      res.json({
                        "requestURL":  "/room",
                        "action": "post",
                        "status": 500,
                        "message": "Query failed for calendar",
                        "timestamp": new Date()
                      });
                    });
                }
                else {
                  
                    var sql = "INSERT INTO ebdb.MeetingRoom (name, calendar) VALUES (?, ?);";

                    var inserts = [name, results.insertId];
                    mysql.format(sql, inserts);

                    console.log(mysql.format(sql, inserts));

                    connection.query(sql, inserts, function(error1, results1, fields1) {
                        if(error1) {
                            return connection.rollback(function() {
                              res.statusCode = 500;
                              console.log(error1);
                              res.json({
                                "requestURL":  "/room",
                                "action": "post",
                                "status": 500,
                                "message": "Query failed",
                                "timestamp": new Date()
                              });
                            });  
                        }
                        else {
                          connection.commit(function(err1) {
                            if(err1) {
                              res.statusCode = 500;
                              console.log(error1);
                              res.json({
                                "requestURL":  "/room",
                                "action": "post",
                                "status": 500,
                                "message": "Transaction commit failed",
                                "timestamp": new Date()
                              });
                            }
                            else {
                              res.statusCode = 201;
                              res.setHeader("Location", "/room/" + results1.insertId);
                              res.json({
                                "requestURL":  "/room",
                                "action": "post",
                                "status": 201,
                                "message": "Meeting Room created successfully",
                                "timestamp": new Date()
                              });
                            }
                          });
                        }
                    });
                  }
              });
            }
          });
        }
      });
    }

});


//retrieving a meeting room
app.get("/room/:roomId", function (req, res) {

    var roomId = req.params.roomId;

    var sql = "SELECT * FROM ebdb.MeetingRoom WHERE id = " + pool.escape(roomId);
    pool.query(sql, function(error, results, fields) {
        console.log(results);
        if(error) {
            console.warn("Query failed");
            res.statusCode = 500;
            res.json({
              "requestURL":  "/room/" + roomId,
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
                "requestURL":  "/room/" + roomId,
                "action": "get",
                "status": 404,
                "message": "Meeting room not found",
                "timestamp": new Date()
              });
            } else {
              // this should never happen since we are selecting on the primary key
              console.warn("Multiple Meeting Rooms returned with roomId: "+ roomId);
              res.statusCode = 500;
              res.json({
                "requestURL":  "/room/" + roomId,
                "action": "get",
                "status": 500,
                "message": "Multiple meeting rooms found",
                "timestamp": new Date()
              });
            }
        }

    });
});

//retrieving a meeting room
app.get("/room/:room_name", function (req, res) {
    var room_name = req.params.room_name;

    var sql = "SELECT * FROM ebdb.MeetingRoom WHERE name = " + pool.escape(room_name);
    pool.query(sql, function(error, results, fields) {
        console.log(results);
        if(error) {
            console.warn("Query failed");
            res.statusCode = 500;
            res.json({
              "requestURL":  "/room/" + room_name,
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
                "requestURL":  "/room/" + room_name,
                "action": "get",
                "status": 404,
                "message": "Meeting room not found",
                "timestamp": new Date()
              });
            } else {
              // this should never happen since we are selecting on the primary key
              console.warn("Multiple Meeting Rooms returned with name: "+ room_name);
              res.statusCode = 500;
              res.json({
                "requestURL":  "/room/" + room_name,
                "action": "get",
                "status": 500,
                "message": "Multiple meeting rooms found",
                "timestamp": new Date()
              });
            }
        }

    });
});

//retrieving all meetings for a given meeting room
app.get("/room/:room_name/meetings", function (req, res) {
    var room_name = req.params.room_name;


    var checkRoomSql = "SELECT * FROM ebdb.MeetingRoom WHERE name = (?);";
    var checkRoomInserts = [room_name];

    pool.query(checkRoomSql, checkRoomInserts, function(error, results, fields) {
      if(error) {
          res.statusCode = 500;
          console.log(error);
          res.json({
            "requestURL":  "/room/:room_name/meetings",
            "action": "get",
            "status": 500,
            "message": "Query failed",
            "timestamp": new Date()
          });
      }
      else if(results.length == 0) {
        res.statusCode = 404;
        console.log(error);
        res.json({
          "requestURL":  "/room/:room_name/meetings",
          "action": "get",
          "status": 404,
          "message": "Meeting room not found",
          "timestamp": new Date()
        });
      }
      else if(results.length == 1) {

        var sql = "SELECT * FROM ebdb.Meeting WHERE room_name = " + pool.escape(room_name) + " AND organizing_event IS NULL ORDER BY start_datetime;";
        console.log(sql);
        pool.query(sql, function(error, results, fields) {
            console.log(results);
            if(error) {
                console.warn("Query failed1");
                res.statusCode = 500;
                res.json({
                  "requestURL":  "/room/:room_name/meetings",
                  "action": "get",
                  "status": 500,
                  "message": "Query failed",
                  "timestamp": new Date()
                });
            }
            else {
                res.statusCode = 200;
                res.send(results);
                //not sure if i need to check if results.length == 0
            }

        });
      }
      else {
        res.statusCode = 404;
        console.log(error);
        res.json({
          "requestURL":  "/room/:room_name/meetings",
          "action": "get",
          "status": 404,
          "message": "Multiple meeting rooms found",
          "timestamp": new Date()
        });
      }
    });

});


//update a meeting room
app.put("/room/:roomId", function (req, res) {
    var roomId = req.params.roomId;

    if(!req.body.name) {
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

    var name = req.body.name || null;

    var sql = "UPDATE ebdb.MeetingRoom SET name = " + pool.escape(name);

    sql += " WHERE id = " + pool.escape(roomId);

    console.log(sql);

    pool.query(sql, function(error, results, fields) {
        //console.log("Results: \n");
        //console.log(results);
        if(error) {
            console.warn("Query failed");
            res.statusCode = 500;
            res.json({
              "requestURL":  "/room/" + roomId,
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
                "requestURL":  "/room/" + roomId,
                "action": "put",
                "status": 200,
                "message": "Meeting Room updated successfully",
                "timestamp": new Date()
              });
            } else { //if (results.affectedRows == 0) {
              res.statusCode = 404;
              res.json({
                "requestURL":  "/room/" + roomId,
                "action": "put",
                "status": 404,
                "message": "Meeting Room not found",
                "timestamp": new Date()
              });
          }
        }
    });


});


//delete a meeting room
app.delete("/room/:roomId", function (req, res) {
    
    var roomId = req.params.roomId;

    var calendarFkSql = "SELECT * FROM ebdb.MeetingRoom WHERE id = " + pool.escape(roomId);

    pool.getConnection(function(err, connection) {
      if(err) {
        res.statusCode = 500;
        res.json({
          "requestURL":  "/room",
          "action": "delete",
          "status": 500,
          "message": "Failed to getConnection from pool",
          "timestamp": new Date()
        });
      }
      else {
        connection.beginTransaction(function(err1) {
          if(err1) {
            res.statusCode = 500;
            res.json({
              "requestURL":  "/room",
              "action": "delete",
              "status": 500,
              "message": "Failed to getConnection from pool",
              "timestamp": new Date()
            });
          }
          else {
            connection.query(calendarFkSql, function(error, results, fields) {
              if(error) {
                return connection.rollback(function() {
                  console.warn("Query failed");
                    console.log(error);
                    res.statusCode = 500;
                    res.json({
                      "requestURL":  "/room/" + roomId,
                      "action": "delete",
                      "status": 500,
                      "message": "Query failed",
                      "timestamp": new Date()
                    });
                });
              }
              else {
                console.log("Results: " + results[0]);
                var calendarId = results[0].calendar;
                console.log("ID: " + calendarId);

                var sql = "DELETE FROM ebdb.MeetingRoom WHERE id = " + pool.escape(roomId);
              
              //delete Meeting Room then Calendar

              connection.query(sql, function(error1, results1, fields) {
                  if(error1) {
                      return connection.rollback(function() {
                          console.warn("Meeting room query failed");
                          console.log(error1);
                          res.statusCode = 500;
                          res.json({
                            "requestURL":  "/room/" + roomId,
                            "action": "delete",
                            "status": 500,
                            "message": "Query failed for meeting room",
                            "timestamp": new Date()
                          });
                      });
                  }
                  else {
                      if(results1.affectedRows != 0) {
                         var calendarSql = "DELETE FROM ebdb.Calendar WHERE id = " + pool.escape(calendarId);
                        
                        connection.query(calendarSql, function(error2, results2, fields2) {
                            if(error2) {
                                return connection.rollback(function() {
                                    console.warn("Query failed for calendar");
                                    console.log(error2);
                                    res.statusCode = 500;
                                    res.json({
                                      "requestURL":  "/room/" + roomId,
                                      "action": "delete",
                                      "status": 500,
                                      "message": "Query failed for calendar",
                                      "timestamp": new Date()
                                    });
                                });
                            }
                            else {
                                if(results2.affectedRows != 0) {
                                  connection.commit(function(err2) {
                                    if(err2) {
                                      res.statusCode = 500;
                                      res.json({
                                        "requestURL":  "/room/" + roomId,
                                        "action": "delete",
                                        "status": 500,
                                        "message": "Commit failed",
                                        "timestamp": new Date()
                                      });
                                    }
                                    else {
                                      res.statusCode = 200;
                                      res.json({
                                        "requestURL":  "/room/" + roomId,
                                        "action": "delete",
                                        "status": 200,
                                        "message": "Meeting Room and their calendar deleted successfully",
                                        "timestamp": new Date()
                                      });
                                    }
                                  });
                                    
                                } else { //if (results.affectedRows == 0) {
                                  return connection.rollback(function() {
                                    res.statusCode = 404;
                                    res.json({
                                      "requestURL":  "/room/" + roomId,
                                      "action": "delete",
                                      "status": 404,
                                      "message": "Calendar not found",
                                      "timestamp": new Date()
                                    });
                                  });
                              }
                            }
                        });
                      } else { //if (results.affectedRows == 0) {
                        return connection.rollback(function() {
                          res.statusCode = 404;
                          res.json({
                            "requestURL":  "/room/" + roomId,
                            "action": "delete",
                            "status": 404,
                            "message": "Meeting Room not found" ,
                            "timestamp": new Date()
                          });
                        });
                    }
                  }
              });
              }
            });
          }
        });
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