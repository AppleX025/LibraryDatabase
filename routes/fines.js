// routes/fines.js - staff page data: unpaid fines, and paying or waiving them
//
// app.js mounts this file at /api/fines, so the addresses in here are written
// relative to that: the route '/' below is reached at /api/fines.
// The staff page that uses it is public/fines-admin.html.

const { Router } = require('../lib/router');       // our own router
const router = Router();
const db = require('../config/db');                 // the MySQL connection
const { isStaff, isAdmin } = require('../middleware/auth');   // who may use each route

// toFineId(text): turns the fine number from the address into a whole number.
// Returns null for anything that is not a plain positive whole number.
// Only digits are accepted, because Number() would also accept things like
// '1e1' (ten), '0x10' (sixteen) or ' 5 ' (five) that were never meant as fine numbers.
function toFineId(text) {
  if (!/^[1-9][0-9]*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;      // refuse numbers too large to be exact
}

// GET /api/fines
// Staff only. Sends back every unpaid fine, biggest first, for the fines page.
// One row per fine: who owes it, for which item, what kind of fine, how much, and since when.
router.get('/', isStaff, async (req, res) => {          // isStaff: any staff member may look
  try {
    // db.query returns [rows, fields]; we only need the rows.
    // The same query is kept in database/fines.sql for trying it out in Workbench.
    const [rows] = await db.query(`
      SELECT f.Fine_id,
             CONCAT(m.First_name, ' ', m.Last_name) AS member_name,   -- first and last name together
             m.Email AS member_email,                                 -- tells two members with the same name apart
             ci.Title,
             f.Fine_type,
             f.Amount,
             DATE_FORMAT(f.Date_assessed, '%Y-%m-%d') AS Date_assessed  -- plain text date, so the browser cannot shift it by a day
        FROM Fine f
        JOIN Loan l         ON l.Loan_id   = f.Loan_id          -- a fine belongs to a loan...
        JOIN Member m       ON m.Member_id = l.Member_id        -- ...which belongs to a member
        JOIN Copy c         ON c.Copy_id   = l.Copy_id          -- the physical copy that was borrowed...
        JOIN CatalogItem ci ON ci.Item_id  = c.Item_id          -- ...and the title it is a copy of
       WHERE f.Is_paid = FALSE                                  -- only fines that are still unpaid
       ORDER BY f.Amount DESC                                   -- biggest first
    `);

    res.json(rows);                                   // send the rows to the page
  } catch (err) {
    // Show the real error in the terminal, but send the browser a vague message
    console.error('Fines list failed:', err);
    res.status(500).json({ message: 'Could not load fines. Please try again.' });
  }
});

// POST /api/fines/:id/pay
// Staff only. Marks one unpaid fine as paid, today.
router.post('/:id/pay', isStaff, async (req, res) => {
  try {
    // The address part after /fines/ arrives as text. Turn it into a whole number
    // and refuse anything else (abc, 1.5, 0, -3).
    const id = toFineId(req.params.id);
    if (id === null) {
      return res.status(400).json({ message: 'Invalid fine number.' });
    }

    // Is_paid = TRUE and Date_paid = today have to be set together: the table's
    // rules refuse a paid fine without a date, or a date on an unpaid fine.
    // "AND Is_paid = FALSE" means an already-paid fine is not touched again, so
    // two staff members clicking Pay on the same fine cannot both succeed.
    const [result] = await db.query(
      `UPDATE Fine
          SET Is_paid = TRUE, Date_paid = CURDATE()
        WHERE Fine_id = ? AND Is_paid = FALSE`,
      [id]);

    // affectedRows is how many rows the UPDATE changed. Zero means no unpaid fine
    // with that number exists: wrong number, or someone already paid it.
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
// Administrators only. Cancels one unpaid fine: the amount becomes 0 and the fine
// counts as settled. There is no "waived" status in the table, so a fine of $0 that
// is marked paid is how a waived fine looks.
router.post('/:id/waive', isAdmin, async (req, res) => {       // isAdmin: ordinary staff are refused with 403
  try {
    const id = toFineId(req.params.id);
    if (id === null) {
      return res.status(400).json({ message: 'Invalid fine number.' });
    }

    // The table accepts an amount of 0 (its rule is Amount >= 0).
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
router.get('/mine', isAuthenticated, async (req, res) => {      // which guard: any logged-in person?
  try {
    // Staff have their own Fines page; refuse them here with a clear 403 message.
    if (req.session.isStaff) {                          // which session value says "staff"?
      return res.status(403).json({ message: 'Members only.' });
    }

    // Same joins as the staff list, but only this member's fines (Loan.Member_id).
    // The member id is the session's userId. Use a ? placeholder, never paste it in.
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
    `, [req.session.userId]);                                      // the member's id

    res.json(rows);
  } catch (err) {
    console.error('My fines failed:', err);
    res.status(500).json({ message: 'Could not fetch your fines. Please try again.' });
  }
});

// POST /api/fines/mine/:id/pay
// A member pays one of THEIR OWN fines (no real money: it just marks it paid).
router.post('/mine/:id/pay', isAuthenticated, async (req, res) => {
  try {
    if (req.session.isStaff) {                          // staff are refused, like above
      return res.status(403).json({ message: 'Members only.' });
    }

    const id = _parseInt__(req.params.id);                  // reuse the helper at the top of the file
    if (id === null) return res.status(400).json({ message: 'Invalid fine number.' });

    // Same UPDATE as the staff Pay, but it must also check the fine belongs to this
    // member. A fine has no Member_id, so join Loan:
    //   UPDATE Fine f JOIN Loan l ON l.Loan_id = f.Loan_id
    //      SET f.Is_paid = TRUE, f.Date_paid = CURDATE()
    //    WHERE f.Fine_id = ? AND l.Member_id = ? AND f.Is_paid = FALSE
    const [result] = await db.query(`UPDATE Fine f JOIN Loan l ON l.Loan_id = f.Loan_id
      SET f.Is_paid = TRUE, f.Date_paid = CURDATE()
    WHERE f.Fine_id = ? AND l.Member_id = ? AND f.Is_paid = FALSE`, [id, req.session.userId]);

    // Zero rows means: not found, not yours, or already paid. Use one message for
    // all three so a member cannot find out whether another member's fine exists.
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
