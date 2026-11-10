-- =====================================================================
-- DEMO ONLY (not part of the reload order): shows the rule trigger trg_loan_rule_renewals firing live.
-- The rule: a member who owes MORE than $2.50 in unpaid fines cannot renew a loan.
-- Run the statements one at a time in MySQL Workbench (Ctrl+Enter runs the one under the cursor).
-- =====================================================================
USE library;

-- MySQL Workbench starts in "safe update" mode and refuses an UPDATE whose WHERE does not use the table's key
-- (Error 1175). The next line switches that off for this connection only, so the UPDATE below can run.
SET SQL_SAFE_UPDATES = 0;


-- 1. What testmember owes: unpaid fines are added up through Fine -> Loan -> Member.
--    This is the same total the trigger calculates before it decides.
SELECT m.Username, SUM(f.Amount) AS unpaid_fines
  FROM Fine f
  JOIN Loan l   ON l.Loan_id   = f.Loan_id
  JOIN Member m ON m.Member_id = l.Member_id
 WHERE f.Is_paid = FALSE AND m.Username = 'testmember'
 GROUP BY m.Username;

-- 2. The loan we try to renew: copy 11, still out, renewed 0 times so far.
SELECT Loan_id, Copy_id, Due_date, Renewal_count FROM Loan WHERE Copy_id = 11 AND Return_date IS NULL;

-- 3. Renew it: one more renewal and a due date 14 days later, in one UPDATE (this is what the app's Renew button does).
--    Before MySQL saves the change, the BEFORE UPDATE trigger runs, sees the member owes more than $2.50,
--    and stops the UPDATE with this error:
--      Error Code: 1644. Rule: a member who owes more than $2.50 in unpaid fines cannot renew.
UPDATE Loan
   SET Renewal_count = Renewal_count + 1,
       Due_date      = DATE_ADD(Due_date, INTERVAL 14 DAY)
 WHERE Copy_id = 11 AND Return_date IS NULL;

-- 4. Nothing was saved: the due date and the renewal count are exactly as in step 2.
SELECT Loan_id, Copy_id, Due_date, Renewal_count FROM Loan WHERE Copy_id = 11 AND Return_date IS NULL;
