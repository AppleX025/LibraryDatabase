// routes/holds.js - Area C: place, list, cancel holds + staff hold list
const { Router } = require('../lib/router');   // our own small router (lib/router.js)
const router = Router();
const db = require('../config/db');

// Juan's shared login checks (middleware/auth.js)
const { isAuthenticated, isStaff } = require('../middleware/auth');

// Holds belong to members (the Hold table stores a Member_id). A logged-in
// person is either a member or a staff employee, and a staff session's userId is
// a Staff_id, which is a different number from a Member_id.
// A library employee who also borrows has two records: their Staff record and a
// Member record (type "Staff") linked to it through Member.Staff_id.
//
// memberForHolds works out which Member_id this request acts for and stores it in
// req.memberId, so the routes below never touch req.session.userId directly.
// Used AFTER isAuthenticated.
//   - a member: their own userId is already a Member_id.
//   - staff with a linked member record: that member's id.
//   - staff without one (for example the plain test staff login): refused with a
//     clear message, because there is no member for the hold to belong to.
const memberForHolds = async (req, res, next) => {
  try {
    if (!req.session.isStaff) {
      req.memberId = req.session.userId;
      return next();
    }

    const [rows] = await db.query(
      'SELECT Member_id FROM Member WHERE Staff_id = ? LIMIT 1',
      [req.session.userId]);

    if (!rows.length) {
      return res.status(403).json({
        error: 'This staff account has no member account, so it cannot place holds.' });
    }

    req.memberId = rows[0].Member_id;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not check your account.' });
  }
};

// POST /api/holds  body: { itemId }  -> place a hold on an item
router.post('/api/holds', isAuthenticated, memberForHolds, async (req, res) => {
  try {
    const itemId = Number(req.body.itemId);
    if (!itemId) return res.status(400).json({ error: 'Missing item.' });

    const [items] = await db.query('SELECT Item_id FROM CatalogItem WHERE Item_id = ?', [itemId]);
    if (!items.length) return res.status(404).json({ error: 'Item not found.' });

    await db.query(
      "INSERT INTO Hold (Item_id, Member_id, Status) VALUES (?, ?, 'Active')",
      [itemId, req.memberId]);
    res.json({ message: 'Hold placed.' });
  } catch (err) {
    // The database allows only one open (Active/Ready) hold per member and item
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'You already have an open hold on this item.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Could not place hold.' });
  }
});

// GET /api/my-holds -> the logged-in member's holds
router.get('/api/my-holds', isAuthenticated, memberForHolds, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT h.Hold_id, ci.Title, h.Status, h.Hold_date, h.Expiry_date
         FROM Hold h JOIN CatalogItem ci ON ci.Item_id = h.Item_id
        WHERE h.Member_id = ?
        ORDER BY h.Hold_date DESC`, [req.memberId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load holds.' });
  }
});

// POST /api/holds/:id/cancel -> cancel one of MY open holds
router.post('/api/holds/:id/cancel', isAuthenticated, memberForHolds, async (req, res) => {
  try {
    // The hold number arrives as text. Only plain whole numbers are accepted,
    // so an address like /api/holds/abc/cancel gets a clear 400, not a database error.
    if (!/^[1-9][0-9]*$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid hold number.' });
    }
    const holdId = Number(req.params.id);

    // Member_id in the WHERE stops people cancelling someone else's hold
    const [result] = await db.query(
      `UPDATE Hold SET Status = 'Cancelled'
        WHERE Hold_id = ? AND Member_id = ? AND Status IN ('Active','Ready')`,
      [holdId, req.memberId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'No open hold found.' });
    }
    res.json({ message: 'Hold cancelled.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not cancel hold.' });
  }
});

// GET /api/staff/holds/:itemId -> waiting holds for an item, oldest first
router.get('/api/staff/holds/:itemId', isStaff, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT h.Hold_id, h.Hold_date, m.Username, m.First_name, m.Last_name
         FROM Hold h JOIN Member m ON m.Member_id = h.Member_id
        WHERE h.Item_id = ? AND h.Status = 'Active'
        ORDER BY h.Hold_date ASC`, [req.params.itemId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load hold list.' });
  }
});

module.exports = router;