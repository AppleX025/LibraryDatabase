// routes/auth.js - Login and logout routes

// app.js mounts this router at '/', so these become:
//   POST /login   and   POST /logout

// Creates a mini-app that holds just these routes
const router = require('express').Router();

// bcrypt compares a typed password against a stored hash
const bcrypt = require('bcrypt');

// MySQL connection pool from config/db.js (promise version)
const db = require('../config/db');


// POST /login
// Called by the fetch() in login.html with { username, password } as JSON.

router.post('/login', async (req, res) => {
  // try/catch so any database or bcrypt error returns a clean 500
  // response instead of leaving the request hanging.
  try {
    // express.json() in app.js parsed the request body into req.body
    const { username, password } = req.body; // field can hold a username or an email

    // Assume staff first. This flips to false if no staff account matches.
    let isStaff = true;

    // Step 1: look for a Staff account with this email.
    // The "?" is a placeholder filled from the array, so the input is
    // never pasted into the SQL (prevents SQL injection).
    // "Staff_id AS id" renames the column so staff and member results
    // have the same shape (id, Password_hash, Is_active).
    // db.execute returns [rows, fields]; we only need the rows.
    let [rows] = await db.execute(
      'SELECT Staff_id AS id, Password_hash, Is_active FROM Staff WHERE Email = ? LIMIT 1',
      [username]);

    // Step 2: no staff match, so look for a Member by username OR email.
    // That's why the value is passed twice, once for each "?".
    if (!rows.length) {
      isStaff = false;
      [rows] = await db.execute(
        'SELECT Member_id AS id, Password_hash, Is_active FROM Member WHERE Username = ? OR Email = ? LIMIT 1',
        [username, username]);
    }

    // rows[0] is the matching account, or undefined if nothing matched
    const user = rows[0];

    // Reject the login if ANY of these is true:
    //   - no account was found
    //   - the account is deactivated (Is_active is 0)
    //   - the password doesn't match the stored bcrypt hash
    // One generic message for all three cases, so an attacker can't tell
    // whether a username exists. 401 = authentication failed.
    if (!user || !user.Is_active || !(await bcrypt.compare(password, user.Password_hash))) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // Login succeeded: store identity in the session. express-session
    // saves this on the server and gives the browser a cookie that points
    // to it. isAuthenticated and isStaff in the middleware read these values.
    req.session.userId = user.id;
    req.session.isStaff = isStaff;

    // Tell login.html it worked; the page uses isStaff to pick staff.html
    // or account.html.
    res.json({ message: 'Logged in.', isStaff });
  } catch (err) {
    // Log the real error in the terminal, but send the browser a vague
    // message so internal details aren't leaked.
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});


// POST /logout

router.post('/logout', (req, res) => {
  // Delete the session from the server. The callback runs when it's done,
  // then we confirm to the front-end, which can redirect to the login page.
  req.session.destroy(() => res.json({ message: 'Logged out.' }));
});

// Export the router so app.js can mount it with app.use('/', require('./routes/auth'))
module.exports = router;
