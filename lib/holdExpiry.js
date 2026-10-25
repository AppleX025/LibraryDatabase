// lib/holdExpiry.js
// This file marks Ready holds as Expired when the member did not pick the item up in time,
// and hands that copy to the next member waiting in line (the same thing the return
// trigger does when an item comes back).

// The MySQL connection pool, so this file can run queries.
const db = require('../config/db');

// How many days a member has to pick up a Ready hold. The hold-ready trigger uses the
// same number when it gives a new Ready hold its expiry date.
const PICKUP_DAYS = 2;

// The check runs at most once every 60 seconds (60 * 1000 milliseconds).
// Expiry is by date, so a minute of delay does not matter, and it avoids a query
// on every single request.
const MIN_GAP_MS = 60 * 1000;

// The time of the last check, in milliseconds. 0 means "never checked yet".
let lastRun = 0;

// expireHolds: finds the Ready holds that ran out of time, marks them Expired, and gives
// each freed copy to the next member in line. It returns nothing.
async function expireHolds() {
  // Date.now() is the current time in milliseconds. If the last check was less than a
  // minute ago, stop here and do nothing.
  const now = Date.now();
  if (now - lastRun < MIN_GAP_MS) return;

  // Save the time of this check, so the next requests within a minute stop above.
  lastRun = now;

  // STEP 1: ask MySQL for every Ready hold whose last pickup day is before today.
  // CURDATE() is today's date. The status text must match the schema exactly.
  // db.query gives back [rows, extraInfo], so [late] keeps only the list of rows.
  const [late] = await db.query(
    `SELECT Hold_id, Item_id, Reserved_copy_id
       FROM Hold
      WHERE Status = 'Ready' AND Expiry_date < CURDATE()`);

  // Go through the expired holds one by one, each in its own transaction, so a problem
  // with one hold does not stop the others.
  for (const hold of late) {
    // "let" because the connection is only filled in inside the try block below.
    let conn;
    try {
      // Borrow one connection from the pool. A transaction needs the same connection
      // for all its queries.
      conn = await db.getConnection();

      // Start the transaction: from here on, nothing is saved for good until commit.
      await conn.beginTransaction();

      // STEP 2: change this hold's status to Expired.
      // "AND Status = 'Ready'" makes sure the hold was not cancelled or picked up in
      // the meantime. The ? is filled with the hold's id from the array below the SQL.
      const [done] = await conn.query(
        "UPDATE Hold SET Status = 'Expired' WHERE Hold_id = ? AND Status = 'Ready'",
        [hold.Hold_id]);

      // The number of rows the UPDATE changed is 0 if someone else already changed this
      // hold. In that case undo the transaction and move on to the next hold.
      if (done.affectedRows === 0) {
        await conn.rollback();
        continue;   // skip to the next hold (the "finally" below still returns the connection)
      }

      // STEP 3: find who is next in line for this item.
      // Only Active holds are waiting. Sorting by the date the hold was placed puts
      // the member who asked first on top, and LIMIT 1 keeps only that one row.
      // FOR UPDATE locks that row so two checks at the same moment cannot both take it.
      const [waiting] = await conn.query(
        `SELECT Hold_id, Member_id  
           FROM Hold
          WHERE Item_id = ? AND Status = 'Active'
          ORDER BY Hold_date
          LIMIT 1
            FOR UPDATE`,
        [hold.Item_id]);

      // waiting is a list of rows. It has one row if somebody is waiting, otherwise it is empty.
      if (waiting.length > 0) {
        // Make the waiting member's hold Ready, reserve the same copy for them, and give
        // them a new pickup deadline of today plus PICKUP_DAYS days.
        await conn.query(
          `UPDATE Hold
              SET Status = 'Ready', Reserved_copy_id = ?,
                  Expiry_date = CURDATE() + INTERVAL ? DAY
            WHERE Hold_id = ?`,
          [hold.Reserved_copy_id, PICKUP_DAYS, waiting[0].Hold_id]);

        // Add a notification so that member sees "ready to pick up" on My Notifications.
        // The id of the member who placed the waiting hold is in waiting[0].
        await conn.query(
          `INSERT INTO Notification (Member_id, Notification_type, Message)
           VALUES (?, 'hold_ready', 'Your item is ready to pick up')`,
          [waiting[0].Member_id]);
      }
      // If nobody is waiting, nothing else happens: the copy is simply free again.

      // Save everything done in this transaction (steps 2 and 3) for good.
      await conn.commit();
    } catch (err) {
      // Something went wrong: undo this hold's changes, print the reason in the
      // terminal, and carry on with the next hold.
      if (conn) await conn.rollback();
      console.error('Could not expire hold', hold.Hold_id, err);
    } finally {
      // Runs after success, after an error, and after "continue": gives the connection
      // back to the pool so it can be used again.
      if (conn) conn.release();
    }
  }
}

// Let other files use the function: const { expireHolds } = require('./lib/holdExpiry');
module.exports = { expireHolds };