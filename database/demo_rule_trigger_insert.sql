-- =====================================================================
-- demo_rule_trigger_insert.sql
-- Shows the rule (semantic) trigger trg_loan_rule_unpaid_fines.
-- The rule: a member who owes MORE than $2.50 in unpaid fines cannot borrow.
-- =====================================================================
USE library;

-- Add up the unpaid fines of member 1 (testmember).
-- A fine belongs to a loan, and a loan belongs to a member, so we join
-- Fine -> Loan -> Member. Is_paid = FALSE keeps only the fines not paid yet.
-- SUM adds their amounts: this is the same total the trigger calculates.
SELECT m.Username,
       SUM(f.Amount) AS unpaid_fines
  FROM Fine f
  JOIN Loan l   ON l.Loan_id   = f.Loan_id
  JOIN Member m ON m.Member_id = l.Member_id
 WHERE f.Is_paid = FALSE
   AND m.Member_id = 1
 GROUP BY m.Username;

-- Try to open a new loan for member 1 (testmember) on copy 1, recorded by staff 1.
-- Before MySQL saves this row, the BEFORE INSERT trigger runs, sees that the
-- member owes more than $2.50, and stops the insert with this error:
--   Error Code: 1644. Rule: a member who owes more than $2.50 in unpaid fines cannot borrow.
-- DATE_ADD(CURDATE(), INTERVAL 14 DAY) makes the due date 14 days from today.
INSERT INTO Loan (Copy_id, Member_id, Staff_id, Loan_type, Due_date)
VALUES (1, 1, 1, 'standard', DATE_ADD(CURDATE(), INTERVAL 14 DAY));

-- Check that nothing was saved: copy 1 is still 'available', because the
-- refused insert never reached the table (and so the checkout trigger never ran).
SELECT Copy_id, Status FROM Copy WHERE Copy_id = 1;
