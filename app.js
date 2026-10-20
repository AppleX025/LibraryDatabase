// =====================================================================
// app.js
// The starting point of the web app. It loads the settings, sets up the
// tools Express needs (reading form data, sessions, static pages),
// plugs in the route files, and starts listening for requests.
// Run it with:  npm start
// =====================================================================

// Load the settings from the .env file (DB_HOST, DB_USER, PORT, ...)
// into process.env so the rest of the code can read them.
require('dotenv').config();

// Libraries this file uses
const express = require('express');             // the web framework
const session = require('express-session');     // remembers who is logged in between requests
const bcrypt = require('bcrypt');               // password checking (currently only used in routes/auth.js)
const db = require('./config/db');              // the MySQL connection pool

// Safety nets: if something fails and nobody catches it, print the reason
// in the terminal instead of the app quietly closing.
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

// Create the app, and pick the port: the PORT from .env, or 3000 if it is missing.
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// Middleware: small helpers that run on every request, in this order
// ---------------------------------------------------------------------
// Read data sent by HTML forms (name=value pairs)
app.use(express.urlencoded({ extended: true }));
// Read data sent as JSON (what our pages send with fetch)
app.use(express.json());

// Sessions: after login, the browser carries a cookie that points to
// the user's session (userId, isStaff). SESSION_SECRET signs that cookie.
// If SESSION_SECRET is missing from the .env file, the code falls back to
// 'fallback_secret'. That is fine for local testing only: a real server must
// set its own secret, because anyone who knows it can forge a login cookie.
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,              // do not re-save a session that did not change
  saveUninitialized: false    // do not create sessions for visitors who never log in
}));

// Serve every file in the public/ folder as a normal web page
// (for example public/login.html is reached at /login.html).
app.use(express.static('public'));

// ---------------------------------------------------------------------
// Route files: each one handles a group of addresses
// ---------------------------------------------------------------------
// Login and logout (POST /login, POST /logout)
app.use('/', require('./routes/auth'));
app.use('/api/catalog', require('./routes/catalog'));

// Report data (staff only). Every route in routes/reports.js is reached
// under /api/reports, for example /api/reports/overdue.
// Data addresses start with /api so they never clash with the report pages in
// public/reports/ (/reports/overdue.html is the page, /api/reports/overdue is its data).
app.use('/api/reports', require('./routes/reports'));

// Circulation: checkout, return, renew and open loans. Every route in
// routes/circulation.js is reached under /api/circulation, for example
// /api/circulation/checkout. The pages are in public/circulation/.
app.use('/api/circulation', require('./routes/circulation'));

// Catalog search data (GET /api/search, defined in routes/search.js).
app.use('/', require('./routes/search'));


// ---------------------------------------------------------------------
// Simple test routes
// ---------------------------------------------------------------------
// Home address: just proves the server is up.
app.get('/', (req, res) => {
    res.send('Library Database Server is running!');
});

// /test-db: runs a tiny query to prove the database connection works.
// Success -> { message: 'Database connected.', solution: 2 }
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS solution');
    res.json({ message: 'Database connected.', solution: rows[0].solution });
  } catch (err) {
    // Show the real error in the terminal and in the response (useful while developing).
    console.error('Database query error:', err);
    res.status(500).json({ message: 'Database failed to connect.', error: err.message });
  }
});

// ---------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// If the server cannot start, explain why.
// EADDRINUSE = another program (often an old copy of this server) already uses that port.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`PORT ${PORT} IS ALREADY IN USE! Close other running servers or use a different port.`);
  } else {
    console.error('Server startup error:', err);
  }
});