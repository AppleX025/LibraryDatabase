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
const { isStaff, isAdmin } = require('../middleware/auth');   // staff may look members up; only administrators may change them

function parseMemberId(value) {
  // Only digits, and the first digit cannot be 0, so "0", "-5", "1.5" and "abc" all fail.
  if (!/^[1-9]\d*$/.test(String(value))) return null;
  const id = Number(value);
  // Very long digit strings turn into numbers that are not exact, so refuse those too.
  if (!Number.isSafeInteger(id)) return null;
  return id;
}

// Shared checks and plain-English messages for member fields (lib/memberValidation.js):
//   clean                 turns blank text into null and trims spaces
//   validateMemberFields  returns a message for the first bad field, or null if all are fine
//   databaseRuleMessage   turns a MySQL rule error into a plain message
const { clean, validateMemberFields, databaseRuleMessage, emailBelongsToStaff} = require('../lib/memberValidation');


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
        WHERE m.Is_deleted = FALSE                                -- deleted accounts are hidden
          AND (m.Username LIKE ? OR m.Email LIKE ?
               OR CONCAT(m.First_name, ' ', m.Last_name) LIKE ?)
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
router.put('/:id', isAdmin, async (req, res) => {
  
  // Collect the values the page sent. clean() turns blanks into null so optional
  // fields (phone, street, ...) are stored as empty instead of as ''.

  const id = parseMemberId(req.params.id);
  if (id === null) return res.status(400).json({ message: 'The member id must be a positive whole number.' });


  const data = {
    firstName: clean(req.body.firstName), lastName: clean(req.body.lastName),
    email: clean(req.body.email), memberType: clean(req.body.memberType),
    phone: clean(req.body.phone), street: clean(req.body.street),
    city: clean(req.body.city), state: clean(req.body.state), zip: clean(req.body.zip)
  };

  // A member linked to a staff account has the type "Staff". The page lists only Student, Faculty
  // and Alumni for normal members, so validate that case as if it were a normal type; the real
  // rule for "Staff" (it can never be set or removed here) is checked below, after the lookup.
  const sentStaffType = data.memberType === 'Staff';
  const problem = validateMemberFields(sentStaffType ? { ...data, memberType: 'Student' } : data);
  if (problem) return res.status(400).json({ message: problem });

  try {

    // Look up this member's CURRENT type. An administrator may edit a Staff-type member's details,
    // but the type itself stays "Staff" (it is the link to their staff account).

    const [current] = await db.query(
      `SELECT t.Type_name
         FROM Member m JOIN MemberType t ON t.Member_type_id = m.Member_type_id
        WHERE m.Member_id = ? AND m.Is_deleted = FALSE`,
      [id]
    );

    if (current.length === 0) return res.status(404).json({ message: 'Member not found.' });
    const isStaffType = current[0].Type_name === 'Staff';
    if (isStaffType && !sentStaffType) {
      return res.status(400).json({ message: "A staff member's account type cannot be changed here." });
    }
    if (!isStaffType && sentStaffType) {
      return res.status(400).json({ message: 'The Staff type is linked to a staff account and cannot be given here.' });
    }

    // The page sends the type by name (like "Student"), so look up its id.
    const [types] = await db.query('SELECT Member_type_id FROM MemberType WHERE Type_name = ?', [data.memberType]);
    if (types.length === 0) return res.status(400).json({ message: 'That member type does not exist.' });

    // The email must be unique. "Member_id <> ?" skips this member's own record,
    // so saving without changing the email is allowed. 409 = clashes with existing data.
    const [dup] = await db.query('SELECT 1 FROM Member WHERE Email = ? AND Member_id <> ?', [data.email, id]);
    if (dup.length) return res.status(409).json({ message: 'An account with that email already exists.' });

    if (await emailBelongsToStaff(db, data.email)) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    // Save the changes. WHERE Member_id = ? makes sure only this one member is updated.
    const [result] = await db.query(
      `UPDATE Member SET Member_type_id = ?, First_name = ?, Last_name = ?, Email = ?,
              Phone = ?, Street = ?, City = ?, State = ?, Zip_code = ? WHERE Member_id = ?`,
      [types[0].Member_type_id, data.firstName, data.lastName, data.email,
       data.phone, data.street, data.city, data.state, data.zip, id]
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
// Deactivating keeps the account and its history (loans and fines refer to the member).
// Login already refuses accounts where Is_active is off.
router.patch('/:id/active', isAdmin, async (req, res) => {
  const id = parseMemberId(req.params.id);
  if (id === null) return res.status(400).json({ message: 'The member id must be a positive whole number.' });

  try {
    // Only a real true counts as "reactivate". Anything else (false, missing, text) deactivates.
    const active = req.body.active === true;

    // Switch the flag for just this member
    const [result] = await db.query('UPDATE Member SET Is_active = ? WHERE Member_id = ?', [active, id]);

    // affectedRows is 0 when no member has that id
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Member not found.' });
    res.json({ message: active ? 'Account reactivated.' : 'Account deactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not change the account status.' });
  }
});

// DELETE /api/members/:id   (administrators only)
// A SOFT delete: nothing is removed from the database. The account gets Is_deleted = TRUE (and is
// switched off, Is_active = FALSE), so the person disappears from the member list, cannot log in
// and cannot borrow, while their loans, fines and holds stay in the database as history.
// Not allowed while the member still has an item out or owes money (settle those first).
// A member linked to a staff account can be deleted too: only the borrowing account is hidden,
// the staff login itself is not touched.
// Their open holds are cancelled so nobody keeps waiting for a person who is gone.
router.delete('/:id', isAdmin, async (req, res) => {
  const id = parseMemberId(req.params.id);
  if (id === null) return res.status(400).json({ message: 'The member id must be a positive whole number.' });

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    // FOR UPDATE locks the member's row while we check, so a checkout cannot sneak in meanwhile.
    const [[member]] = await conn.query('SELECT Member_id FROM Member WHERE Member_id = ? AND Is_deleted = FALSE FOR UPDATE', [id]);
    if (!member) { await conn.rollback(); return res.status(404).json({ message: 'Member not found.' }); }
    const [[out]] = await conn.query('SELECT COUNT(*) AS n FROM Loan WHERE Member_id = ? AND Return_date IS NULL', [id]);
    if (out.n > 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'This member still has an item on loan. Return it first.' });
    }
    // Unpaid fines: join Fine to the member's loans.
    const [[owed]] = await conn.query(
      `SELECT COUNT(*) AS n FROM Fine f JOIN Loan l ON l.Loan_id = f.Loan_id
        WHERE l.Member_id = ? AND f.Is_paid = FALSE`, [id]);
    if (owed.n > 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'This member has unpaid fines. Pay or waive them first.' });
    }
    await conn.query("UPDATE Hold SET Status = 'Cancelled' WHERE Member_id = ? AND Status IN ('Active','Ready')", [id]);
    await conn.query('UPDATE Member SET Is_deleted = TRUE, Date_deleted = NOW(), Is_active = FALSE WHERE Member_id = ?', [id]);
    await conn.commit();
    res.json({ message: 'Member deleted. The account is hidden and cannot log in; the history is kept.' });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Could not delete the member.' });
  } finally {
    if (conn) conn.release();
  }
});

// Export the router so app.js can mount it with app.use('/api/members', require('./routes/members'))
module.exports = router;