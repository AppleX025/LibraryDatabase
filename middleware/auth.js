// Auth middleware - route guards for logged-in users and staff

// Middleware functions run before a route handler. Each one either:
//   - calls next() to let the request continue to the route, or
//   - sends a response itself, which stops the request there.
//
// Usage in a route file:
//   router.get('/account', isAuthenticated, (req, res) => { ... });
//   router.post('/staff/members', isStaff, (req, res) => { ... });
//
// These rely on the login route setting req.session.userId (and
// req.session.isStaff for staff) when a user logs in successfully.

// Allows any logged-in user (member or staff) through.
const isAuthenticated = (req, res, next) => {
  // req.session exists because express-session is set up in app.js.
  // userId is only set after a successful login, so if it's missing,
  // the visitor isn't logged in.
  // The `req.session &&` check avoids an error if the session is undefined.
  if (req.session && req.session.userId) return next();

  // 401 Unauthorized = "you need to log in first"
  return res.status(401).json({ message: 'You must be logged in.' });
};

// Allows only logged-in staff through (for staff-only pages and actions).
const isStaff = (req, res, next) => {
  // Two conditions must both be true:
  //   - userId: the user is logged in
  //   - isStaff: the login route flagged this session as a staff account
  if (req.session && req.session.userId && req.session.isStaff) return next();

  // 403 Forbidden = "we know who you are (or not), but you aren't allowed here"
  return res.status(403).json({ message: 'You must be staff to access this page.' });
};

// Export both functions so other files can import them with:
//   const { isAuthenticated, isStaff } = require('./path/to/this/file');
module.exports = { isAuthenticated, isStaff };
