-- =====================================================================
-- reports.sql  --  saved queries (views) that the staff-only report pages read
-- Run after schema.sql (and sample_data.sql if you want rows to look at).
-- CREATE OR REPLACE means this file is safe to run again after edits.
-- =====================================================================
USE library;

-- ---------------------------------------------------------------------
-- Report 1: Overdue loans
-- Every loan that is still out (no return date) and past its due date.
--   overdue_days = whole days since the due date
--   fine_so_far  = $0.35 per day, capped at $10.00 per item (mini-world rule)
-- Sorting is NOT done here; the page asks for it:
--   SELECT * FROM Overdue_Loans ORDER BY overdue_days DESC;
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW Overdue_Loans AS
SELECT Loan.Loan_id,
       CONCAT(Member.First_name, ' ', Member.Last_name)  AS member_name,  
       Member.Email                                      AS member_email,
       CatalogItem.Title                                 AS title,
       Copy.Barcode                                      AS barcode,
       Loan.Due_date                                     AS due_date,
       DATEDIFF(CURDATE(), Loan.Due_date)                AS overdue_days,
       LEAST(DATEDIFF(CURDATE(), Loan.Due_date) * 0.35, 10.00) AS fine_so_far
FROM Loan
JOIN Member      ON Member.Member_id   = Loan.Member_id      -- who has it
JOIN Copy        ON Copy.Copy_id       = Loan.Copy_id        -- which physical copy
JOIN CatalogItem ON CatalogItem.Item_id = Copy.Item_id       -- what the title is
WHERE Loan.Return_date IS NULL          -- still out
  AND Loan.Due_date < CURDATE();        -- and already past due



-- ---------------------------------------------------------------------
-- Report 2: Fines owed per member
-- One row per member who has at least one UNPAID fine.
--   unpaid_fines_count = how many unpaid fines
--   unpaid_fines_total = total dollars owed
--   is_blocked         = 1 if they owe more than $2.50 (mini-world: may be blocked from checkouts/renewals)
-- A fine belongs to a loan, and the loan belongs to a member, so we join Fine -> Loan -> Member.
-- Sorting is done by the page:  SELECT * FROM Member_Fines ORDER BY unpaid_fines_total DESC;
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW Member_Fines AS
SELECT Member.Member_id,
       CONCAT(Member.First_name, ' ', Member.Last_name) AS member_name,
       Member.Email                                     AS member_email,
       COUNT(Fine.Fine_id)                              AS unpaid_fines_count,
       SUM(Fine.Amount)                                 AS unpaid_fines_total,
       SUM(Fine.Amount) > 2.50                          AS is_blocked
FROM Fine
JOIN Loan   ON Loan.Loan_id     = Fine.Loan_id        -- which loan earned the fine
JOIN Member ON Member.Member_id = Loan.Member_id      -- who had that loan
WHERE Fine.Is_paid = FALSE                            -- only fines still owed
GROUP BY Member.Member_id, Member.First_name, Member.Last_name, Member.Email;  -- one row per member

-- ---------------------------------------------------------------------
-- Report 3: Most borrowed items
-- One row per catalog item that has been borrowed at least once (returned loans count too).
--   times_borrowed = total number of loans for that item, across all its copies
-- Sorting is done by the page:
--   SELECT * FROM Most_Borrowed_Items ORDER BY times_borrowed DESC, title;
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW Most_Borrowed_Items AS
SELECT CatalogItem.Item_id,
       CatalogItem.Title,
       CatalogItem.Item_type,
       COUNT(Loan.Loan_id) AS times_borrowed
FROM Loan
JOIN Copy        ON Copy.Copy_id       = Loan.Copy_id
JOIN CatalogItem ON CatalogItem.Item_id = Copy.Item_id
GROUP BY CatalogItem.Item_id,CatalogItem.Title, CatalogItem.Item_type;