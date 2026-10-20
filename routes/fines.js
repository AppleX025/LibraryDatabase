// routes/fines.js - staff page data: unpaid fines, and paying or waiving them
//
// app.js mounts this file at /api/fines, so the addresses in here are written
// relative to that: the route '/' below is reached at /api/fines.
// The staff page that uses it is public/fines-admin.html.

const { Router } = require('../lib/router');       // our own router
const router = Router();
const db = require('../config/db');                 // the MySQL connection
const { isStaff, isAdmin } = require('../middleware/auth');   // who may use each route

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

module.exports = router;                             // so app.js can mount it
