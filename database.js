'use strict';
const mysql = require('mysql');
var pm = require('promise-mysql');

const Promise = require('promise');

var pool = pm.createPool({
    connectionLimit: 10,
    host: process.env.RDS_HOSTNAME || "localhost",
    user: process.env.RDS_USERNAME || "root",
    password: process.env.RDS_PASSWORD || "",
    port: process.env.RDS_PORT || 3306
});

module.exports.pool = pool;

module.exports.testConnection = new Promise(function(resolve, reject) {
    return pool.getConnection(function(err, connection) {
        if (err) {
            resolve(false);
        } else {
            connection.release();
            resolve(true);
        }
    });
});

module.exports.formatQuery = function(query, inserts) {
    return mysql.format(query, inserts);
};

module.exports.formatDatetime = function(datetime) {
    // remove 'T', milliseconds, and timezone indicator
    return datetime.replace("T", " ").replace(/\.[0-9]*Z/, "");
};

module.exports.cleanUp = function () {
    pool.end();
    console.log("closed database connection pool");
};
