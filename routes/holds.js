// routes/holds.js - Area C: place, list, cancel holds + staff hold list
const { Router } = require('../lib/router');   // our own small router (lib/router.js)
const router = Router();
const db = require('../config/db');

// Juan's shared login checks (middleware/auth.js)
const { isAuthenticated, isStaff } = require('../middleware/auth');

// Holds belong to members. A staff session's userId is a Staff_id, not a
// Member_id, so block staff from member-only actions. Used AFTER isAuthenticated.
const membersOnly = (req, res, next) => {
  if (req.session.isStaff) {
    return res.status(403).json({ error: 'Only members can use holds.' });
  }
  next();
};

// POST /api/holds  body: { itemId }  -> place a hold on an item
router.post('/api/holds', isAuthenticated, membersOnly, async (req, res) => {
  try {
    const itemId = Number(req.body.itemId);
    if (!itemId) return res.status(400).json({ error: 'Missing item.' });

    const [items] = await db.query('SELECT Item_id FROM CatalogItem WHERE Item_id = ?', [itemId]);
    if (!items.length) return res.status(404).json({ error: 'Item not found.' });

    await db.query(
      "INSERT INTO Hold (Item_id, Member_id, Status) VALUES (?, ?, 'Active')",
      [itemId, req.session.userId]);
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
router.get('/api/my-holds', isAuthenticated, membersOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT h.Hold_id, ci.Title, h.Status, h.Hold_date, h.Expiry_date
         FROM Hold h JOIN CatalogItem ci ON ci.Item_id = h.Item_id
        WHERE h.Member_id = ?
        ORDER BY h.Hold_date DESC`, [req.session.userId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load holds.' });
  }
});

// POST /api/holds/:id/cancel -> cancel one of MY open holds
router.post('/api/holds/:id/cancel', isAuthenticated, membersOnly, async (req, res) => {
  try {
    // Member_id in the WHERE stops people cancelling someone else's hold
    const [result] = await db.query(
      `UPDATE Hold SET Status = 'Cancelled'
        WHERE Hold_id = ? AND Member_id = ? AND Status IN ('Active','Ready')`,
      [req.params.id, req.session.userId]);
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