// =====================================================================
// app.js
// The starting point of the web app. It loads the settings, sets up the
// tools every request needs (static pages, sessions), plugs in the route
// files, and starts listening for requests.
// Run it with:  npm start
//
// The web server itself is our own small one in lib/ (it uses only the tools
// that come with Node.js): lib/app.js builds the server, lib/router.js matches
// addresses to routes, lib/static.js sends the pages in public/, lib/session.js
// remembers who is logged in, and lib/password.js checks passwords.
// =====================================================================

// Load the settings from the .env file (DB_HOST, DB_USER, PORT, ...)
// into process.env so the rest of the code can read them.
// On Azure there is no .env file; the settings come from the app settings.
require('./lib/env').loadEnv();

// Parts of our own server that this file uses
const { createApp } = require('./lib/app');          // builds the web server
const { serveStatic } = require('./lib/static');     // sends the files in public/
const { createSession } = require('./lib/session');  // remembers who is logged in between requests
const db = require('./config/db');                   // the MySQL connection pool

// Safety nets: if something fails and nobody catches it, print the reason
// in the terminal instead of the app quietly closing.
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

// Create the app, and pick the port: the PORT from .env, or 3000 if it is missing.
const app = createApp();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// Steps that run on every request, in this order
// (reading the data a page sends with a request is done by the server itself)
// ---------------------------------------------------------------------
// Serve every file in the public/ folder as a normal web page
// (for example public/login.html is reached at /login.html).
// This comes first so pages and stylesheets never need a session.
app.use(serveStatic('public'));

// Sessions: after login, the browser carries a cookie that points to
// the user's session (userId, isStaff, isAdmin). SESSION_SECRET signs that cookie.
// There is no fallback secret: if SESSION_SECRET is missing, the app refuses
// to start (with a message saying what to add), because anyone who knows the
// secret can forge a login cookie.
let sessionStep;
try {
  sessionStep = createSession({ secret: process.env.SESSION_SECRET });
} catch (err) {
  console.error(err.message);   // says exactly what to add to the .env file
  process.exit(1);              // stop here: a server without sessions would be broken
}
app.use(sessionStep);

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

// Fines: the unpaid fines list and paying or waiving a fine (staff only). Every route in
// routes/fines.js is reached under /api/fines. The page is public/fines-admin.html.
app.use('/api/fines', require('./routes/fines'));

// Notifications: a member's list, and marking one or all as read. Every route in
// routes/notifications.js is reached under /api/notifications. The page is public/my-notifications.html.
app.use('/api/notifications', require('./routes/notifications'));

// Catalog search data (GET /api/search, defined in routes/search.js).
app.use('/', require('./routes/search'));
app.use('/', require('./routes/holds'));

// ---------------------------------------------------------------------
// Simple test routes
// ---------------------------------------------------------------------
// Home address: the app starts at the catalog search, which anyone can use
// without logging in. (The server itself answers at /test-db, below.)
app.get('/', (req, res) => {
    res.redirect('/search.html');
});

// /test-db: runs a tiny query to prove the database connection works.
// Success -> { message: 'Database connected.', solution: 2 }
// Anyone can open this address, so a failure shows only a general message.
// The real reason (which can contain the database user name and server address)
// is written to the terminal / the Azure log stream, where only we can read it.
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS solution');
    res.json({ message: 'Database connected.', solution: rows[0].solution });
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).json({ message: 'Database failed to connect.' });
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
