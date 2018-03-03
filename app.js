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

    var sql = "INSERT INTO ebdb.Meeting (name, startDateTime, endDateTime) VALUES (?, ?, ?);"
    var inserts = [name, startDateTime, endDateTime];
    mysql.format(sql, inserts);

    console.log(mysql.format(sql, inserts));

    pool.query(sql, inserts, function(error, results, fields) {
        console.log(results);
        console.log(results[0]);
        console.log(error);
        console.log(fields);
        if(error) {
            res.statusCode = 500;
            console.log(error);
            res.send("The server encountered an error.");
        }
        else {
            res.statusCode = 201;
            res.setHeader("Location", "/meeting/" + results.insertId);
            res.send();
        }
    });

});


//retrieving a meeting
app.get("/meeting/:meetingId", function (req, res) {
    var meetingId = req.params.meetingId;

    var sql = "SELECT * FROM ebdb.Meeting WHERE id = " + pool.escape(meetingId);
    pool.query(sql, function(error, results, fields) {
        if(error) {
            res.statusCode = 500;
            console.log(error);
            res.send("The server encountered an error.");
        }
        else {
            res.statusCode = 200;
            //console.log(results);
            res.send(results);
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

    if(name) {
        sql += " SET name = " + pool.escape(name);
        setAlreadyFlag = true;
    }

    if(startDateTime) {
        if(setAlreadyFlag) {
            sql += ",";
        }
        else {
            sql += " SET";
        }
        setAlreadyFlag = true;
        sql += " startDateTime = " + pool.escape(startDateTime);
    }

    if(endDateTime) {
        if(setAlreadyFlag) { 
            sql += ","; 
        }
        else {
            sql += " SET";
        }
        sql += " endDateTime = " + pool.escape(endDateTime);
    }

    sql += " WHERE id = " + pool.escape(meetingId);

    console.log(sql);

    pool.query(sql, function(error, results, fields) {
        if(error) {
            res.statusCode = 500;
            console.log(error);
            res.send("The server encountered an error.");
        }
        else {
            res.statusCode = 200;
            res.send("Meeting updated successfully.");
        }
    });


});


//delete a meeting
app.delete("/meeting/:meetingId", function (req, res) {
    
    var meetingId = req.params.meetingId;

    var sql = "DELETE FROM ebdb.Meeting WHERE id = " + pool.escape(meetingId);
    pool.query(sql, function(error, results, fields) {
        if(error) {
            res.statusCode = 500;
            console.log(error);
            res.send("The server encountered an error.");
        }
        else {
            res.statusCode = 200;
            res.send("Meeting deleted successfully.");
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