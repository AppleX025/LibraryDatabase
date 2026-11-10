-- =====================================================================
-- DEMO ONLY (not part of the reload order): shows the overdue-fine notice trigger firing live.
-- Run it in MySQL Workbench right before logging in as eva_s on the demo.
--
-- What it shows: when an overdue fine is generated, the DATABASE (trigger trg_fine_overdue_notify,
-- trigger_fine_notify.sql) writes the member's notice by itself. The app only has to log in and
-- read it: the notice appears on the home page, right under the search bar.
-- =====================================================================
USE library;

-- MySQL Workbench starts in "safe update" mode and refuses an UPDATE whose WHERE does not use the table's key
-- (Error 1175). The next line switches that off for this connection only, so the UPDATE below can run.
SET SQL_SAFE_UPDATES = 0;


-- 1. Pretend time has passed: Eva's loan of copy 12 (Murder on the Orient Express) was checked out 17 days ago
--    and was due 3 days ago, so it is now 3 days overdue and has no fine yet.
UPDATE Loan
   SET Checkout_date = CURDATE() - INTERVAL 17 DAY,
       Due_date      = CURDATE() - INTERVAL 3 DAY
 WHERE Copy_id = 12 AND Return_date IS NULL;

-- 2. Generate the fine, exactly as the app does it every day for every open overdue loan
--    (lib/overdueFines.js): $0.35 per day late, at most $10.00. THIS INSERT is what fires the trigger.
INSERT INTO Fine (Loan_id, Fine_type, Amount)
SELECT Loan_id, 'overdue', LEAST(DATEDIFF(CURDATE(), Due_date) * 0.35, 10.00)
  FROM Loan
 WHERE Copy_id = 12 AND Return_date IS NULL
ON DUPLICATE KEY UPDATE Amount = IF(Is_paid, Amount, GREATEST(Amount, VALUES(Amount)));

-- 3. The notice the trigger just wrote for Eva (nobody inserted it by hand in this script).
SELECT Notification_id, Notification_type, Is_read, Message
  FROM Notification
 WHERE Member_id = (SELECT Member_id FROM Member WHERE Username = 'eva_s')
 ORDER BY Notification_id DESC
 LIMIT 3;
