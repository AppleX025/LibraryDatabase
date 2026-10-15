// =====================================================================
// routes/reports.js
// Staff-only report data. Each route reads one saved view (created in
// database/reports.sql) and sends the rows back as JSON. The report
// pages in public/reports/ call these addresses and show the rows
// as tables.
// =====================================================================

// Express's Router: a small "mini-app" that holds a group of routes.
const router = require('express').Router();

// The database connection (a pool of MySQL connections set up in config/db.js).
const db = require('../config/db');

// isStaff: Juan's check that the person is logged in AND is staff.
// The { } takes just that one function out of middleware/auth.js.
const { isStaff } = require('../middleware/auth');

// ---------------------------------------------------------------------
// GET /api/reports/overdue
// Overdue loans, most overdue first. Staff only.
// (app.js adds the "/api/reports" part; this file adds "/overdue".)
// ---------------------------------------------------------------------
router.get('/overdue', isStaff, async (req, res) => {
    try {
        // Ask MySQL for the saved view, sorting here (views don't sort).
        // FIX: the view is named Overdue_Loans, and the sort was missing.
        const [rows] = await db.query(
            'SELECT * FROM Overdue_Loans ORDER BY overdue_days DESC'
        );

        // Send the rows back to the browser as JSON.
        res.json(rows);
    } catch (error) {
        // Something failed (for example the database is down).
        // Print the details in the terminal for us, and send a short
        // generic message to the browser (no internal details).
        console.error('Error fetching overdue reports:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// FIX: this line was missing. It makes the router available to app.js,
// which loads this file with require('./routes/reports').
module.exports = router;