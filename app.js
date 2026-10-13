// app.js - Main entry point for Library

// Loads variables from the .env file (PORT, SESSION_SECRET, DB credentials, etc.)
// into process.env. This must run before anything reads process.env.
require('dotenv').config();

// --- Imports ---
const express = require('express');           // Web framework that handles routes and requests
const session = require('express-session');   // Tracks logged-in users across requests via cookies
const bcrypt = require('bcrypt');             // Password hashing library (not used in this file;
                                              // it's likely used in routes/auth.js)
const db = require('./config/db');            // MySQL connection/pool defined in config/db.js

// ------------------------------------------------------------
// Global error handlers
// ------------------------------------------------------------
// Without these, an unexpected error can silently crash the app.
// These log the full error so you can see why something failed.

// Fires when a synchronous error is thrown and never caught with try/catch
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

// Fires when a Promise is rejected and has no .catch() or try/catch handling it
// (for example, a failed async database call)
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

// Create the Express application instance
const app = express();

// Use the port from .env if set, otherwise default to 3000
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// Middleware (runs on every request, in the order listed)
// ------------------------------------------------------------

// Parses form submissions (Content-Type: application/x-www-form-urlencoded),
// like a normal HTML <form method="POST">, into req.body.
// extended: true allows nested objects in form data.
app.use(express.urlencoded({ extended: true }));

// Parses JSON request bodies (Content-Type: application/json) into req.body
app.use(express.json());

// Sets up sessions so the server can remember who is logged in.
// After login, you can store data like req.session.userId.
app.use(session({
  // Secret used to sign the session cookie so it can't be tampered with.
  // Use a long random value in .env; the fallback is only for development.
  secret: process.env.SESSION_SECRET || 'fallback_secret',

  // false = don't re-save the session to the store if nothing changed
  resave: false,

  // false = don't create a session (or set a cookie) until something is
  // stored in it, such as when a user logs in
  saveUninitialized: false
}));

// Serves static files (HTML, CSS, client-side JS, images) from the /public folder.
// For example, public/login.html is available at /login.html.
app.use(express.static('public'));

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------

// Mounts all routes defined in routes/auth.js at the root path.
// This is where login, register, logout, etc. likely live.
app.use('/', require('./routes/auth'));
app.use('/api/catalog', require('./routes/catalog'));

// Simple health-check route to confirm the server is up.
// Visiting http://localhost:3000/ shows this message.
app.get('/', (req, res) => {
    res.send('Library Database Server is running!');
});

// Test route to confirm the app can talk to MySQL.
// Visit http://localhost:3000/test-db to try it.
app.get('/test-db', async (req, res) => {
  try {
    // Runs a trivial query. If it succeeds, the connection works.
    // db.query returns [rows, fields]; we only need the rows.
    const [rows] = await db.query('SELECT 1 + 1 AS solution');

    // Respond with JSON; rows[0].solution should be 2
    res.json({ message: 'Database connected.', solution: rows[0].solution });
  } catch (err) {
    // Log the error in the terminal for debugging
    console.error('Database query error:', err);

    // Send a 500 (server error) response with the error message
    res.status(500).json({ message: 'Database failed to connect.', error: err.message });
  }
});

// ------------------------------------------------------------
// Start the server
// ------------------------------------------------------------

// app.listen starts accepting HTTP connections and returns the server object.
// We save it so we can attach an error listener below.
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Handles errors that happen when starting up or running the server
server.on('error', (err) => {
  // EADDRINUSE means another process is already using this port
  if (err.code === 'EADDRINUSE') {
    console.error(`PORT ${PORT} IS ALREADY IN USE! Close other running servers or use a different port.`);
  } else {
    // Any other startup error gets logged in full
    console.error('Server startup error:', err);
  }
});
