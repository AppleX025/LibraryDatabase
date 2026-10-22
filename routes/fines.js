// routes/fines.js - fines: the staff list, paying, waiving, and a member's own fines
//
// app.js mounts this file at /api/fines, so the route '/' below is /api/fines.
// The staff page for it is public/fines-admin.html, and the member page is
// public/my-fines.html.

const { Router } = require('../lib/router');                         // our own router
const router = Router();
const db = require('../config/db');                                   // the MySQL connection
const { isStaff, isAdmin, isAuthenticated } = require('../middleware/auth');   // who may use each route

// The fine number comes from the address as text ("12"). This turns it into a
// whole number, or returns null if it is not one.
// I only accept plain digits, because Number() would also let through things
// like '1e1' (10) or '0x10' (16), and those are not fine numbers.
function toFineId(text) {
  if (!/^[1-9][0-9]*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;      // numbers that are too big are not exact, so refuse them
}

// GET /api/fines
// Staff only. Every unpaid fine, biggest first, for the staff fines page.
router.get('/', isStaff, async (req, res) => {
  try {
    // db.query gives back [rows, fields] and I only need the rows
    const [rows] = await db.query(`
      SELECT f.Fine_id,
             CONCAT(m.First_name, ' ', m.Last_name) AS member_name,   -- first and last name together
             m.Email AS member_email,                                 -- tells two members with the same name apart
             ci.Title,
             f.Fine_type,
             f.Amount,
             DATE_FORMAT(f.Date_assessed, '%Y-%m-%d') AS Date_assessed  -- as text, so the browser cannot move the date by a day
        FROM Fine f
        JOIN Loan l         ON l.Loan_id   = f.Loan_id          -- a fine belongs to a loan...
        JOIN Member m       ON m.Member_id = l.Member_id        -- ...which belongs to a member
        JOIN Copy c         ON c.Copy_id   = l.Copy_id          -- the copy that was borrowed...
        JOIN CatalogItem ci ON ci.Item_id  = c.Item_id          -- ...and the title it is a copy of
       WHERE f.Is_paid = FALSE                                  -- only fines that are still unpaid
       ORDER BY f.Amount DESC                                   -- biggest first
    `);

    res.json(rows);
  } catch (err) {
    // The real error goes to the terminal; the browser only gets a short message
    console.error('Fines list failed:', err);
    res.status(500).json({ message: 'Could not load fines. Please try again.' });
  }
});

// POST /api/fines/:id/pay
// Staff only. Marks one unpaid fine as paid, today.
router.post('/:id/pay', isStaff, async (req, res) => {
  try {
    // Turn the number in the address into a whole number, or stop
    const id = toFineId(req.params.id);
    if (id === null) {
      return res.status(400).json({ message: 'Invalid fine number.' });
    }

    // The table wants Is_paid and Date_paid set together, so I set both.
    // "AND Is_paid = FALSE" makes sure a fine that is already paid is not touched,
    // so two staff clicking Pay on the same fine cannot both succeed.
    const [result] = await db.query(
      `UPDATE Fine
          SET Is_paid = TRUE, Date_paid = CURDATE()
        WHERE Fine_id = ? AND Is_paid = FALSE`,
      [id]);

    // affectedRows is how many rows the UPDATE changed. 0 means there is no unpaid
    // fine with that number: wrong number, or it was already paid.
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'That fine does not exist or is already paid.' });
    }

    res.json({ message: 'Fine marked as paid.' });
  } catch (err) {
    console.error('Pay fine failed:', err);
    res.status(500).json({ message: 'Could not mark the fine as paid. Please try again.' });
  }
});

// POST /api/fines/:id/waive
// Administrators only. Cancels one unpaid fine. The table has no "waived" status,
// so a waived fine is saved as an amount of 0 that is marked paid.
router.post('/:id/waive', isAdmin, async (req, res) => {
  try {
    const id = toFineId(req.params.id);
    if (id === null) {
      return res.status(400).json({ message: 'Invalid fine number.' });
    }

    // The table allows an amount of 0 (its rule is Amount >= 0)
    const [result] = await db.query(
      `UPDATE Fine
          SET Amount = 0, Is_paid = TRUE, Date_paid = CURDATE()
        WHERE Fine_id = ? AND Is_paid = FALSE`,
      [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'That fine does not exist or is already paid.' });
    }

    res.json({ message: 'Fine waived.' });
  } catch (err) {
    console.error('Waive fine failed:', err);
    res.status(500).json({ message: 'Could not waive the fine. Please try again.' });
  }
});

// GET /api/fines/mine
// A logged-in member sees their own unpaid fines.
router.get('/mine', isAuthenticated, async (req, res) => {    // isAuthenticated: any logged-in person
  try {
    // Staff use the staff Fines page, so they are turned away here
    if (req.session.isStaff) {
      return res.status(403).json({ message: 'Members only.' });
    }

    // Same joins as the staff list, but only this member's fines.
    // A fine has no member of its own, so I get to the member through the loan
    // (Loan.Member_id). The member id is the logged-in user's id, and it goes in
    // through the ? so it is never pasted into the SQL.
    const [rows] = await db.query(`
      SELECT f.Fine_id,
             ci.Title,
             f.Fine_type,
             f.Amount,
             DATE_FORMAT(f.Date_assessed, '%Y-%m-%d') AS Date_assessed
        FROM Fine f
        JOIN Loan l         ON l.Loan_id = f.Loan_id
        JOIN Copy c         ON c.Copy_id = l.Copy_id
        JOIN CatalogItem ci ON ci.Item_id = c.Item_id
       WHERE l.Member_id = ?
         AND f.Is_paid = FALSE                      -- only unpaid fines
       ORDER BY f.Date_assessed
    `, [req.session.userId]);

    res.json(rows);
  } catch (err) {
    console.error('My fines failed:', err);
    res.status(500).json({ message: 'Could not fetch your fines. Please try again.' });
  }
});

// POST /api/fines/mine/:id/pay
// A member pays one of their own fines. No real money is involved: it only marks
// the fine as paid.
router.post('/mine/:id/pay', isAuthenticated, async (req, res) => {
  try {
    // Staff pay fines on the staff Fines page
    if (req.session.isStaff) {
      return res.status(403).json({ message: 'Members only.' });
    }

    const id = toFineId(req.params.id);
    if (id === null) {
      return res.status(400).json({ message: 'Invalid fine number.' });
    }

    // Same UPDATE as the staff Pay, but it also checks that the fine is this
    // member's. I join Loan for that, because the fine only knows its loan.
    // Without "l.Member_id = ?" any member could pay any fine by guessing numbers.
    const [result] = await db.query(
      `UPDATE Fine f
         JOIN Loan l ON l.Loan_id = f.Loan_id
          SET f.Is_paid = TRUE, f.Date_paid = CURDATE()
        WHERE f.Fine_id = ? AND l.Member_id = ? AND f.Is_paid = FALSE`,
      [id, req.session.userId]);

    // 0 rows means the fine does not exist, is not theirs, or is already paid.
    // I use one message for all three, so a member cannot find out whether
    // someone else's fine exists.
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Fine not found or already paid.' });
    }

    res.json({ message: 'Fine paid. Thank you.' });
  } catch (err) {
    console.error('Pay my fine failed:', err);
    res.status(500).json({ message: 'Could not pay your fine. Please try again.' });
  }
});

module.exports = router;                             // so app.js can mount it
