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

// ---------------------------------------------------------------------
// GET /api/reports/fines
// Members who owe unpaid fines, biggest total first. Staff only.
// (app.js adds the "/api/reports" part; this file adds "/fines".)
// ---------------------------------------------------------------------
router.get('/fines', isStaff, async (req, res) => {
    try {
        // Ask MySQL for the saved view Member_Fines (one row per member who
        // still owes money). Views don't sort, so we sort here:
        // the member who owes the most (unpaid_fines_total) comes first.
        // CHANGED: the view is Member_Fines (not "Fines"), and the amount
        // column is unpaid_fines_total (not "total_fines").
        const [rows] = await db.query(
            'SELECT * FROM Member_Fines ORDER BY unpaid_fines_total DESC'
        );

        // Send the rows back to the browser as JSON.
        res.json(rows);
    } catch (error) {
        // Something failed (for example the database is down or a name is wrong).
        // Print the real error in the terminal for us, and send the browser a
        // short generic message so no internal details leak out.
        console.error('Error fetching fines report:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ---------------------------------------------------------------------
// GET /api/reports/borrowed
// Catalog items ranked by how many times they were borrowed (returned
// loans count too), most borrowed first. Staff only.
// (app.js adds the "/api/reports" part; this file adds "/borrowed".)
// ---------------------------------------------------------------------
router.get('/borrowed', isStaff, async (req, res) => {
    try {
        // Ask MySQL for the saved view Most_Borrowed_Items (one row per item
        // that was borrowed at least once). Views don't sort, so we sort here:
        // highest times_borrowed first, and when two items have the same
        // count, alphabetically by Title so the order never changes between
        // page loads.
        const [rows] = await db.query(
            'SELECT * FROM Most_Borrowed_Items ORDER BY times_borrowed DESC, Title'
        );

        // Send the rows back to the browser as JSON.
        res.json(rows);
    } catch (error) {
        // Something failed (for example the database is down or a name is wrong).
        // Print the real error in the terminal for us, and send the browser a
        // short generic message so no internal details leak out.
        console.error('Error fetching borrowed report:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Makes this router available to app.js, which loads this file with
// require('./routes/reports') and mounts it at /api/reports.
module.exports = router;