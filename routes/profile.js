// =====================================================================
// routes/profile.js
// "My profile": a logged-in member reads and edits their own details.
//
// Routes in this file (app.js adds the "/api/profile" part):
//   GET /api/profile            member only   the member's own details
//   PUT /api/profile            member only   save new contact details
//   PUT /api/profile/password   member only   change the password
//
// The page that calls these routes is public/profile.html (with profile.js).
//
// Safety rule used by every route here: the member is always found from the
// login session (req.session.userId), never from a number sent by the page.
// That way a member can only ever read or change their OWN account.
//
// What a member can change: first and last name, email, phone and address.
// What they cannot change here: username, member type and registration date
// (staff manage those on the Members page).
//
// The checks on the details are the same ones used by registration and by the
// staff edit page (lib/memberValidation.js), so all three agree on the rules.
// =====================================================================

// Our own small router (lib/router.js), the same one every route file uses.
const { Router } = require('../lib/router');
const router = Router();

// The database connection pool (config/db.js).
const db = require('../config/db');

// Juan's login check (middleware/auth.js): lets the request through only for logged-in people.
const { isAuthenticated } = require('../middleware/auth');

// Shared checks for member details (lib/memberValidation.js).
const { clean, validateMemberFields, databaseRuleMessage, emailBelongsToStaff } = require('../lib/memberValidation');

// Password hashing (lib/password.js): hashPassword makes the stored text,
// verifyPassword checks a typed password against it.
const { hashPassword, verifyPassword } = require('../lib/password');

// ---------------------------------------------------------------------
// ownMember: runs before every route below, after isAuthenticated.
// It finds the member row for this login and stores it in req.member.
// It refuses (403 = "not allowed") two kinds of login:
//   - a staff login: staff accounts live in a different table and are
//     managed by an administrator, so there is no member profile to edit;
//   - a member of type "Staff" (an employee who also borrows): like the
//     staff edit page, their details are managed by an administrator.
// ---------------------------------------------------------------------
async function ownMember(req, res, next) {
    try {
        // A staff session's userId is a Staff_id, not a Member_id, so stop here.
        if (req.session.isStaff) {
            return res.status(403).json({ message: 'Staff accounts do not have a member profile. An administrator manages them.' });
        }

        // The member's own row, with the name of their member type (Student, Faculty, ...).
        const [rows] = await db.query(
            `SELECT m.Member_id, m.Username, m.First_name, m.Last_name, m.Email, m.Phone,
                    m.Street, m.City, m.State, m.Zip_code, m.Password_hash,
                    DATE_FORMAT(m.Date_registered, '%Y-%m-%d') AS Date_registered,
                    mt.Type_name
               FROM Member m
               JOIN MemberType mt ON mt.Member_type_id = m.Member_type_id
              WHERE m.Member_id = ?`,
            [req.session.userId]);

        // No row: the account no longer exists (should not happen while logged in).
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Your account was not found.' });
        }
        if (rows[0].Type_name === 'Staff') {
            return res.status(403).json({ message: 'Staff-type members are managed by an administrator.' });
        }

        req.member = rows[0];   // the route that runs next reads the member from here
        next();
    } catch (err) {
        console.error('Profile lookup failed:', err);
        res.status(500).json({ message: 'Could not load your profile. Please try again.' });
    }
}

// ---------------------------------------------------------------------
// GET /api/profile
// Sends the member's details to the page. The password hash is never sent.
// ---------------------------------------------------------------------
router.get('/', isAuthenticated, ownMember, (req, res) => {
    const m = req.member;
    res.json({
        username: m.Username,
        memberType: m.Type_name,
        dateRegistered: m.Date_registered,
        firstName: m.First_name,
        lastName: m.Last_name,
        email: m.Email,
        phone: m.Phone,
        street: m.Street,
        city: m.City,
        state: m.State,
        zip: m.Zip_code
    });
});

// ---------------------------------------------------------------------
// PUT /api/profile
// Body: { firstName, lastName, email, phone, street, city, state, zip }
// Saves the member's new contact details after checking every rule.
// ---------------------------------------------------------------------
router.put('/', isAuthenticated, ownMember, async (req, res) => {
    // clean() trims the text and turns a blank into null, so an optional field
    // that was emptied is stored as "nothing" instead of as an empty string.
    const data = {
        firstName: clean(req.body?.firstName),
        lastName: clean(req.body?.lastName),
        email: clean(req.body?.email),
        phone: clean(req.body?.phone),
        street: clean(req.body?.street),
        city: clean(req.body?.city),
        // The database only accepts capital letters for the state.
        state: clean(req.body?.state)?.toUpperCase() ?? null,
        zip: clean(req.body?.zip),
        // The member type is not editable here; the shared check wants it, so use the current one.
        memberType: req.member.Type_name
    };

    // Same rules as registration and the staff edit page.
    const problem = validateMemberFields(data);
    if (problem) return res.status(400).json({ message: problem });

    try {
        // The email must stay unique. "Member_id <> ?" skips this member's own row,
        // so saving without changing the email is allowed. 409 = clashes with existing data.
        const [taken] = await db.query(
            'SELECT 1 FROM Member WHERE Email = ? AND Member_id <> ?',
            [data.email, req.member.Member_id]);
        if (taken.length > 0 || await emailBelongsToStaff(db, data.email)) {
            return res.status(409).json({ message: 'An account with that email already exists.' });
        }

        // WHERE Member_id = ? makes sure only this member's row is changed.
        await db.query(
            `UPDATE Member
                SET First_name = ?, Last_name = ?, Email = ?, Phone = ?,
                    Street = ?, City = ?, State = ?, Zip_code = ?
              WHERE Member_id = ?`,
            [data.firstName, data.lastName, data.email, data.phone,
             data.street, data.city, data.state, data.zip, req.member.Member_id]);

        // The menu greets the member by the first name saved at login ("Hello, Eva"),
        // so keep that name up to date for the rest of this session.
        req.session.name = data.firstName;

        res.json({ message: 'Your profile was saved.' });
    } catch (err) {
        // Two saves at the same moment can still hit the unique email rule.
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'An account with that email already exists.' });
        }
        // MySQL's own CHECK rules turned into a plain-English message.
        const ruleMessage = databaseRuleMessage(err);
        if (ruleMessage) return res.status(400).json({ message: ruleMessage });

        console.error('Profile save failed:', err);
        res.status(500).json({ message: 'Could not save your profile. Please try again.' });
    }
});

// ---------------------------------------------------------------------
// PUT /api/profile/password
// Body: { currentPassword, newPassword, confirmPassword }
// Changes the member's password. The current password must be right, so a
// stranger at an unlocked computer cannot lock the member out.
// ---------------------------------------------------------------------
router.put('/password', isAuthenticated, ownMember, async (req, res) => {
    // The passwords must be text. Anything else (missing, a number) becomes ''.
    const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const next = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const confirm = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

    // Same password rules as registration: 8 to 1000 characters.
    if (!current) return res.status(400).json({ message: 'Enter your current password.' });
    if (next.length < 8) return res.status(400).json({ message: 'The new password must be at least 8 characters long.' });
    if (next.length > 1000) return res.status(400).json({ message: 'The new password must be 1000 characters or fewer.' });
    if (next !== confirm) return res.status(400).json({ message: 'The new password and its confirmation do not match.' });
    if (next === current) return res.status(400).json({ message: 'The new password must be different from the current one.' });

    try {
        // Check the current password against the stored hash.
        // 403 (not 401) so the page does not treat it as "logged out".
        if (!(await verifyPassword(current, req.member.Password_hash))) {
            return res.status(403).json({ message: 'The current password is not correct.' });
        }

        // Save only the new hash, never the password itself.
        await db.query('UPDATE Member SET Password_hash = ? WHERE Member_id = ?',
            [await hashPassword(next), req.member.Member_id]);

        res.json({ message: 'Your password was changed.' });
    } catch (err) {
        console.error('Password change failed:', err);
        res.status(500).json({ message: 'Could not change your password. Please try again.' });
    }
});

// Hand the router to app.js, which mounts it at /api/profile.
module.exports = router;
