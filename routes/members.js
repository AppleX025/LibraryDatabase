// routes/members.js - staff-only routes for managing member accounts.
// app.js mounts this router at /api/members, so these become:
//   GET   /api/members?q=text      (search or list members)
//   PUT   /api/members/:id         (edit a member)
//   PATCH /api/members/:id/active  (deactivate or reactivate a member)

// Our own small router (lib/router.js)
const { Router } = require('../lib/router');

// Creates a mini-app that holds just these routes
const router = Router();

// MySQL connection pool from config/db.js (promise version)
const db = require('../config/db');

// isStaff blocks anyone who is not a logged-in staff member (middleware/auth.js).
// It is listed before the route function, so it runs first.
const { isStaff } = require('../middleware/auth');

// Shared checks and plain-English messages for member fields (lib/memberValidation.js):
//   clean                 turns blank text into null and trims spaces
//   validateMemberFields  returns a message for the first bad field, or null if all are fine
//   databaseRuleMessage   turns a MySQL rule error into a plain message
const { clean, validateMemberFields, databaseRuleMessage } = require('../lib/memberValidation');


// GET /api/members?q=text
// Lists members, or searches them by name, username or email.
// The staff page (members-admin.html) calls this when it opens and when you search.
router.get('/', isStaff, async (req, res) => {
  // try/catch so a database error returns a clean 500 instead of leaving the request hanging
  try {
    // The text typed in the search box (null if it is empty)
    const q = clean(req.query.q);

    // % means "anything", so the search matches the text anywhere in a value.
    // With no text this becomes "%%", which matches every member.
    const like = `%${q || ''}%`;

    // Each "?" below is filled from the array, so what was typed is never pasted
    // into the SQL (this prevents SQL injection).
    // The JOIN adds the type name (Student, Faculty, ...) from MemberType.
    // CONCAT lets "Alice Rivera" match a search for the full name.
    // LIMIT 200 keeps the answer from getting huge.
    const [rows] = await db.query(
      `SELECT m.Member_id, m.Username, m.First_name, m.Last_name, m.Email, m.Phone,
              m.Street, m.City, m.State, m.Zip_code, m.Is_active, t.Type_name
         FROM Member m JOIN MemberType t ON t.Member_type_id = m.Member_type_id
        WHERE m.Username LIKE ? OR m.Email LIKE ?
           OR CONCAT(m.First_name, ' ', m.Last_name) LIKE ?
        ORDER BY m.Last_name, m.First_name LIMIT 200`,
      [like, like, like]
    );

    // Send the matching members back as JSON
    res.json(rows);
  } catch (err) {
    // Log the real error in the terminal, but send the browser a vague message
    console.error(err);
    res.status(500).json({ message: 'Could not load members.' });
  }
});


// PUT /api/members/:id
// Edits one member's details and member type. The username and password are not changed here.
// :id is the Member_id and arrives as req.params.id.
router.put('/:id', isStaff, async (req, res) => {
  // Collect the values the page sent. clean() turns blanks into null so optional
  // fields (phone, street, ...) are stored as empty instead of as ''.
  const data = {
    firstName: clean(req.body.firstName), lastName: clean(req.body.lastName),
    email: clean(req.body.email), memberType: clean(req.body.memberType),
    phone: clean(req.body.phone), street: clean(req.body.street),
    city: clean(req.body.city), state: clean(req.body.state), zip: clean(req.body.zip)
  };

  // Check every value before touching the database.
  // 400 = the request itself was wrong, and the message says what to fix.
  const problem = validateMemberFields(data);
  if (problem) return res.status(400).json({ message: problem });

  try {
    // The page sends the type by name (like "Student"), so look up its id.
    const [types] = await db.query('SELECT Member_type_id FROM MemberType WHERE Type_name = ?', [data.memberType]);
    if (types.length === 0) return res.status(400).json({ message: 'That member type does not exist.' });

    // The email must be unique. "Member_id <> ?" skips this member's own record,
    // so saving without changing the email is allowed. 409 = clashes with existing data.
    const [dup] = await db.query('SELECT 1 FROM Member WHERE Email = ? AND Member_id <> ?', [data.email, req.params.id]);
    if (dup.length) return res.status(409).json({ message: 'Another account already uses that email.' });

    // Save the changes. WHERE Member_id = ? makes sure only this one member is updated.
    const [result] = await db.query(
      `UPDATE Member SET Member_type_id = ?, First_name = ?, Last_name = ?, Email = ?,
              Phone = ?, Street = ?, City = ?, State = ?, Zip_code = ? WHERE Member_id = ?`,
      [types[0].Member_type_id, data.firstName, data.lastName, data.email,
       data.phone, data.street, data.city, data.state, data.zip, req.params.id]
    );

    // affectedRows is 0 when no member has that id
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Member not found.' });
    res.json({ message: 'Member updated.' });
  } catch (err) {
    // Safety net: two edits at the same moment can still hit the unique email rule
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That email is already in use.' });

    // If MySQL itself refused a value (a CHECK rule or a value that is too long),
    // show a plain-English message instead of a server error
    const ruleMessage = databaseRuleMessage(err);
    if (ruleMessage) return res.status(400).json({ message: ruleMessage });

    // Anything else is unexpected: log it, and keep the browser message vague
    console.error(err);
    res.status(500).json({ message: 'Could not update the member.' });
  }
});


// PATCH /api/members/:id/active
// Deactivates or reactivates one account. The page sends { active: true } or { active: false }.
// Members are never deleted: loans and fines refer to them, so the history must stay.
// Login already refuses accounts where Is_active is off.
router.patch('/:id/active', isStaff, async (req, res) => {
  try {
    // Only a real true counts as "reactivate". Anything else (false, missing, text) deactivates.
    const active = req.body.active === true;

    // Switch the flag for just this member
    const [result] = await db.query('UPDATE Member SET Is_active = ? WHERE Member_id = ?', [active, req.params.id]);

    // affectedRows is 0 when no member has that id
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Member not found.' });
    res.json({ message: active ? 'Account reactivated.' : 'Account deactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not change the account status.' });
  }
});

// Export the router so app.js can mount it with app.use('/api/members', require('./routes/members'))
module.exports = router;