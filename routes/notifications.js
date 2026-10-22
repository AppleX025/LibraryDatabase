// routes/notifications.js - a member's notifications: the list, mark one as read, mark all as read
//
// app.js mounts this file at /api/notifications, so the route '/' below is /api/notifications.

const { Router } = require('../lib/router');                  // our own router
const router = Router();
const db = require('../config/db');                            // the MySQL connection
const { isAuthenticated } = require('../middleware/auth');                 // any logged-in person may use these routes

// The notification number comes from the address as text ("12"). This turns it into a
// whole number, or returns null if it is not one. I only accept plain digits, because
// Number() would also let through things like '1e1' or '0x10'.
function toNotificationId(text) {
  if (!/^[1-9][0-9]*$/.test(text)) return null;                // starts with 1-9, then any digits (no 0, no minus sign)
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;                           // refuse numbers that are too big to be exact
}

// GET /api/notifications
// A logged-in member sees their own notifications, newest first.
router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Notifications belong to members. Staff accounts have no notifications of their own,
    // so they are turned away, the same way as on the member fines page.
    if (req.session.isStaff) {
      return res.status(403).json({ message: 'Members only.' });
    }

    // The member id is the logged-in user's id. It goes in through the ? so it is
    // never pasted into the SQL. DATE_FORMAT sends the date as plain text so the browser
    // cannot move it by a day.
    const [rows] = await db.query(`
      SELECT Notification_id,
             Notification_type,
             Message,
             DATE_FORMAT(Date_sent, '%Y-%m-%d %H:%i') AS Date_sent,
             Is_read
        FROM Notification
       WHERE Member_id = ?
       ORDER BY Date_sent DESC, Notification_id DESC            -- newest first (the second one breaks ties)
    `, [req.session.userId]);

    res.json(rows);
  } catch (err) {
    console.error('Notifications list failed:', err);
    res.status(500).json({ message: 'Could not load your notifications. Please try again.' });
  }
});

// POST /api/notifications/:id/read
// A member marks one of their own notifications as read.
router.post('/:id/read', isAuthenticated, async (req, res) => {
  try {
    if (req.session.isStaff) {
      return res.status(403).json({ message: 'Members only.' });
    }

    const id = toNotificationId(req.params.id);
    if (id === null) {
      return res.status(400).json({ message: 'Invalid notification number.' });
    }

    // "AND Member_id = ?" makes sure a member can only change their own notifications.
    // Without it, any member could mark any notification by guessing numbers.
    const [result] = await db.query(
      `UPDATE Notification
          SET Is_read = TRUE
        WHERE Notification_id = ? AND Member_id = ?`,
      [id, req.session.userId]);

    // affectedRows is how many rows the UPDATE matched. 0 means there is no such
    // notification for this member. I use one message for "does not exist" and
    // "not yours", so a member cannot find out whether someone else's exists.
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    res.json({ message: 'Marked as read.' });
  } catch (err) {
    console.error('Mark notification read failed:', err);
    res.status(500).json({ message: 'Could not mark it as read. Please try again.' });
  }
});

// POST /api/notifications/read-all
// A member marks all of their unread notifications as read.
router.post('/read-all', isAuthenticated, async (req, res) => {
  try {
    if (req.session.isStaff) {
      return res.status(403).json({ message: 'Members only.' });
    }

    // Only this member's rows that are still unread
    const [result] = await db.query(
      `UPDATE Notification
          SET Is_read = TRUE
        WHERE Member_id = ? AND Is_read = FALSE`,
      [req.session.userId]);

    // result.affectedRows is how many were changed. It can be 0 (everything was already
    // read), and that is not an error, so this always answers 200.
    res.json({ message: `Marked ${result.affectedRows} notification(s) as read.` });
  } catch (err) {
    console.error('Mark all notifications read failed:', err);
    res.status(500).json({ message: 'Could not mark them as read. Please try again.' });
  }
});

module.exports = router;                                          // so app.js can mount it
