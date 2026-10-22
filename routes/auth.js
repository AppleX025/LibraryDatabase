// routes/auth.js - Login and logout routes

// app.js mounts this router at '/', so these become:
//   POST /login   and   POST /logout

// Our own small router (lib/router.js)
const { Router } = require('../lib/router');

// Creates a mini-app that holds just these routes
const router = Router();

// verifyPassword compares a typed password against a stored hash (lib/password.js)
const { verifyPassword, hashPassword } = require('../lib/password');

// MySQL connection pool from config/db.js (promise version)
const db = require('../config/db');

const { clean, validateMemberFields, databaseRuleMessage } = require('../lib/memberValidation');


// POST /login
// Called by the fetch() in login.html with { username, password } as JSON.

router.post('/login', async (req, res) => {
  // try/catch so any database or hashing error returns a clean 500
  // response instead of leaving the request hanging.
  try {
    // The server (lib/app.js) parsed the request body into req.body
    const { username, password } = req.body; // field can hold a username or an email

    // Both must be text. A missing or odd value (for example an empty request, or a
    // number) cannot be a real login, and the database search below needs text.
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Enter your username and password.' });
    }

    // Assume staff first. This flips to false if no staff account matches.
    let isStaff = true;

    // Step 1: look for a Staff account with this email.
    // The "?" is a placeholder filled from the array, so the input is
    // never pasted into the SQL (prevents SQL injection).
    // "Staff_id AS id" renames the column so staff and member results
    // have the same shape (id, Password_hash, Is_active).
    // Is_admin is read too: it is 1 for an administrator (staff who may also
    // waive fines) and 0 for ordinary staff. Members have no such column.
    // db.execute returns [rows, fields]; we only need the rows.
    let [rows] = await db.execute(
      'SELECT Staff_id AS id, Password_hash, Is_active, Is_admin FROM Staff WHERE Email = ? LIMIT 1',
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
    //   - the password doesn't match the stored hash
    // One generic message for all three cases, so an attacker can't tell
    // whether a username exists. 401 = authentication failed.
    if (!user || !user.Is_active || !(await verifyPassword(password, user.Password_hash))) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // Login succeeded: store identity in the session. The session step
    // (lib/session.js) saves this on the server and gives the browser a
    // cookie that points to it. isAuthenticated and isStaff in the middleware read these values.
    req.session.userId = user.id;
    req.session.isStaff = isStaff;

    // An administrator is a staff account whose Is_admin flag is set.
    // "isStaff &&" keeps a member from ever counting as an administrator,
    // and "user.Is_admin ? true : false" turns the database's 1 or 0 into true or false.
    const isAdmin = isStaff && user.Is_admin ? true : false;
    req.session.isAdmin = isAdmin;

    // Tell login.html it worked; the page uses isStaff to choose where to
    // send the visitor next. isAdmin is included so a page can show or hide
    // admin-only buttons.
    res.json({ message: 'Logged in.', isStaff, isAdmin });
  } catch (err) {
    // Log the real error in the terminal, but send the browser a vague
    // message so internal details aren't leaked.
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /register: lets a visitor who is not logged in create a member account.
router.post('/register', async (req, res) => {
  // Pull every field out of the request and clean blanks to null.
  const data = {
    username: clean(req.body.username),
    firstName: clean(req.body.firstName),
    lastName: clean(req.body.lastName),
    email: clean(req.body.email),
    password: req.body.password ? String(req.body.password) : '',
    memberType: clean(req.body.memberType),
    phone: clean(req.body.phone),
    street: clean(req.body.street),
    city: clean(req.body.city),
    state: clean(req.body.state),
    zip: clean(req.body.zip)
  };

  // Username and password are checked here; the rest is checked by the shared helper.
  if (!data.username) return res.status(400).json({ message: 'Please choose a username.' });
  if (data.password.length < 8) {
    return res.status(400).json({ message: 'The password must be at least 8 characters long.' });
  }
  // lib/password.js refuses passwords over 1000 characters, so give a clear message first.
  if (data.password.length > 1000) {
    return res.status(400).json({ message: 'The password must be 1000 characters or fewer.' });
  }
  const problem = validateMemberFields(data);
  if (problem) return res.status(400).json({ message: problem });

  try {
    // Look the type up by name so the page never sends a raw id (and Staff is refused above).
    const [types] = await db.query('SELECT Member_type_id FROM MemberType WHERE Type_name = ?', [data.memberType]);
    if (types.length === 0) return res.status(400).json({ message: 'That member type does not exist.' });

    // Friendly 409s: check for an existing username or email before inserting.
    const [dupUser] = await db.query('SELECT 1 FROM Member WHERE Username = ?', [data.username]);
    if (dupUser.length) return res.status(409).json({ message: 'That username is already taken. Please choose another.' });
    const [dupEmail] = await db.query('SELECT 1 FROM Member WHERE Email = ?', [data.email]);
    if (dupEmail.length) return res.status(409).json({ message: 'An account with that email already exists.' });

    // Never store the plain password; store the hash.
    const hash = await hashPassword(data.password);

        await db.query(
      `INSERT INTO Member (Member_type_id, Username, First_name, Last_name, Email, Phone,
                           Street, City, State, Zip_code, Password_hash, Is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [types[0].Member_type_id, data.username, data.firstName, data.lastName, data.email,
       data.phone, data.street, data.city, data.state, data.zip, hash]
    );
    res.status(201).json({ message: 'Account created. You can now log in.' });
  } catch (err) {
    // Two people registering at the same moment can still hit the unique keys.
    if (err.code === 'ER_DUP_ENTRY') {
      const which = /uq_member_email/.test(err.sqlMessage || '') ? 'email' : 'username';
      return res.status(409).json({ message: `That ${which} is already in use.` });
    }
    const ruleMessage = databaseRuleMessage(err);
    if (ruleMessage) return res.status(400).json({ message: ruleMessage });
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// POST /logout

router.post('/logout', (req, res) => {
  // Delete the session from the server. The callback runs when it's done,
  // then we confirm to the front-end, which can redirect to the login page.
  req.session.destroy(() => res.json({ message: 'Logged out.' }));
});

// GET /me
// Tells a page who is visiting: are they logged in, are they staff, and are
// they an administrator?
// Pages call this when they load, so they can show "Login" or "Log out",
// send visitors away from staff-only pages, and hide admin-only buttons.
// It always answers with a normal response, even for logged-out visitors,
// because "not logged in" is a valid answer, not an error.
router.get('/me', (req, res) => {
  // userId is only saved in the session after a successful login.
  // If it exists the visitor is logged in (true), otherwise false.
  const loggedIn = req.session.userId ? true : false;

  // isStaff was saved at login too: true for staff accounts, false for members.
  // For a logged-out visitor it is missing, so this becomes false.
  const isStaff = req.session.isStaff ? true : false;

  // isAdmin was saved at login as well: true only for an administrator.
  // It is missing for members and logged-out visitors, so it becomes false.
  const isAdmin = req.session.isAdmin ? true : false;

  // Send the answers back as JSON, e.g. { "loggedIn": true, "isStaff": true, "isAdmin": false }.
  // { loggedIn, isStaff, isAdmin } is shorthand for { loggedIn: loggedIn, isStaff: isStaff, ... }.
  res.json({ loggedIn, isStaff, isAdmin });
});

// Export the router so app.js can mount it with app.use('/', require('./routes/auth'))
module.exports = router;
