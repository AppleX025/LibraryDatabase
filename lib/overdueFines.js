// lib/overdueFines.js
// This file starts the overdue fine on the day an item becomes overdue, and raises it each
// day after that, while the item is still out. (Before, the fine only appeared when the
// item was returned.)
//
// MySQL triggers only react to a change in a table. They cannot wake up by themselves
// when midnight passes, so something has to add the fine rows. This file does that, the
// same way lib/holdExpiry.js expires old holds: it runs before the app's /api requests,
// at most once a minute. The notice the member sees is made by a trigger, not here:
// trg_fine_overdue_notify (database/trigger_fine_notify.sql) fires when the fine row is added.

// The MySQL connection pool, so this file can run queries.
const db = require('../config/db');

// The check runs at most once every 60 seconds (60 * 1000 milliseconds). Fines grow by the
// day, so a minute of delay does not matter, and it avoids a query on every single request.
const MIN_GAP_MS = 60 * 1000;

// The time of the last check, in milliseconds. 0 means "never checked yet".
let lastRun = 0;

// accrueOverdueFines: gives every loan that is still out and past its due date an overdue
// fine of $0.35 per day late, capped at $10.00 (the same rule as trg_loan_overdue_fine).
// It returns nothing.
async function accrueOverdueFines() {
  // If the last check was less than a minute ago, stop here and do nothing.
  const now = Date.now();
  if (now - lastRun < MIN_GAP_MS) return;
  lastRun = now;

  // One statement does the whole job:
  //  - the SELECT finds the open loans whose due date is before today (CURDATE() is today);
  //  - INSERT adds a fine for each one. A loan can have only one 'overdue' fine
  //    (uq_fine_loan_type), so when it already has one, ON DUPLICATE KEY UPDATE raises it
  //    to today's amount instead (GREATEST = never lower it);
  //  - IF(Is_paid, ...) leaves a fine that was paid or waived alone;
  //  - VALUES(Amount) is the amount that the INSERT tried to add.
  // Each new fine fires trg_fine_overdue_notify, and each raised fine fires trg_fine_overdue_update.
  await db.query(
    `INSERT INTO Fine (Loan_id, Fine_type, Amount)
     SELECT Loan_id, 'overdue', LEAST(DATEDIFF(CURDATE(), Due_date) * 0.35, 10.00)
       FROM Loan
      WHERE Return_date IS NULL AND Due_date < CURDATE()
     ON DUPLICATE KEY UPDATE
       Amount = IF(Is_paid, Amount, GREATEST(Amount, VALUES(Amount)))`);
}

module.exports = { accrueOverdueFines };
