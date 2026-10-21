// config/db.js - MySQL connection pool for the Library app

// Other files import this module (for example, `const db = require('./config/db')`)
// and call db.query(...) to talk to the database.

// mysql2 is the MySQL driver. This is the callback-style version of the library;
// we convert it to promises at the bottom so we can use async/await.
const mysql = require('mysql2');

// Loads the .env file into process.env so the DB_* values below are available.
// app.js also calls this, but keeping it here means this file works on its own.
// (loadEnv is our own small .env reader, lib/env.js.)
require('../lib/env').loadEnv();

// A "pool" keeps several database connections open and reuses them,
// instead of opening a new connection for every request (which is slow).
const pool = mysql.createPool({
    host: process.env.DB_HOST,         // Server address (e.g. localhost or Azure MySQL hostname)

    // The port MySQL listens on. Optional: when DB_PORT is missing (or is not a
    // number) it is left undefined, and the driver uses MySQL's usual port, 3306.
    // That is also what Azure's MySQL uses, so hosted settings normally leave it out.
    port: Number(process.env.DB_PORT) || undefined,

    user: process.env.DB_USER,         // MySQL username
    password: process.env.DB_PASS,     // MySQL password (the .env variable must be named DB_PASS exactly)
    database: process.env.DB_NAME,     // Which database/schema to use by default

    // Encrypted connection. Azure's MySQL server normally refuses unencrypted
    // connections, so hosted settings add DB_SSL=true. Locally the setting is
    // missing, and the connection stays as it was (no encryption needed on one computer).
    // rejectUnauthorized makes the app check that the server really is who it says it is.
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,

    // If all connections are busy, wait in line for one to free up
    // instead of throwing an error immediately.
    waitForConnections: true,

    // Maximum number of connections open at the same time.
    // Extra requests wait their turn (see waitForConnections).
    connectionLimit: 10,

    // Maximum number of requests allowed to wait in line.
    // 0 means no limit.
    queueLimit: 0
});

// Export the promise version of the pool so other files can write:
//   const [rows] = await db.query('SELECT ...');
// instead of using callbacks.
module.exports = pool.promise();
