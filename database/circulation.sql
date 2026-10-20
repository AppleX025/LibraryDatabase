-- =====================================================================
-- circulation.sql  --  triggers and saved query for checkout / return / renew
-- Run order:  schema.sql  ->  seed_accounts.sql  ->  trigger_overdue_fine.sql
--             ->  sample_data.sql  ->  this file
-- Safe to run more than once (it drops the old versions first).
--
-- Every copy of the database needs this file run once (each person's local
-- copy and the Azure database). Without it, copy statuses never change on
-- checkout/return, and the open loans page fails because its view is missing.
--
-- What is in here:
--   - Two TRIGGERS: SQL that MySQL runs by itself whenever a Loan row is
--     added or changed. They keep Copy.Status in step with the loans, no
--     matter which page (or person in Workbench) changed the loan.
--   - One VIEW: a saved SELECT that can be read like a table. The open
--     loans page (routes/circulation.js) reads it.
-- =====================================================================
USE library;

-- ---------------------------------------------------------------------
-- Trigger 1: trg_loan_checkout_copy_status
-- When a loan is opened (a new Loan row), the copy's Status becomes 'on loan'.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_loan_checkout_copy_status;

-- ---------------------------------------------------------------------
-- Trigger 2: trg_loan_return_copy_status
-- When a loan is returned (Return_date goes from empty to filled in), the
-- copy's Status goes back to 'available'.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_loan_return_copy_status;

-- DELIMITER: the trigger bodies contain ';', so we temporarily use $$
-- to mark where each whole CREATE TRIGGER ends.
DELIMITER $$

-- Inside a trigger, NEW means "the loan row as it is now" (after the insert or
-- update) and OLD means "the row as it was before" (only for updates).
CREATE TRIGGER trg_loan_checkout_copy_status
AFTER INSERT ON Loan            -- AFTER: the loan row is already saved when this runs
FOR EACH ROW                    -- runs once for every loan row that was added
BEGIN
    -- Only an open loan takes the copy off the shelf. A loan saved with its
    -- return date already filled in (old history, like in sample_data.sql)
    -- leaves the copy's Status alone.
    IF NEW.Return_date IS NULL THEN
        UPDATE Copy
           SET Status = 'on loan'
         WHERE Copy_id = NEW.Copy_id;
    END IF;
END$$

-- MySQL allows more than one AFTER UPDATE trigger on Loan, so this one runs
-- alongside Josh's trg_loan_overdue_fine without either getting in the way.
CREATE TRIGGER trg_loan_return_copy_status
AFTER UPDATE ON Loan            -- runs after any change to a loan (return or renewal)
FOR EACH ROW                    -- once for every loan row that was changed
BEGIN
    -- Only act on the moment the item comes back:
    --   OLD.Return_date IS NULL      -> it was still open before this update
    --   NEW.Return_date IS NOT NULL  -> it now has a return date
    -- Checking OLD means a renewal (which also updates the loan) does nothing here.
    IF OLD.Return_date IS NULL AND NEW.Return_date IS NOT NULL THEN
        -- Only a copy that is still 'on loan' goes back on the shelf. A copy marked
        -- 'lost' or 'withdrawn' while it was out keeps that status.
        UPDATE Copy
           SET Status = 'available'
         WHERE Copy_id = NEW.Copy_id
           AND Status = 'on loan';
    END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- Query: open loans for a member (saved as a view)
-- One row per item the member still has out, with when it is due.
-- The open loans page reads it with:
--     SELECT * FROM Member_Open_Loans WHERE Member_id = ? ORDER BY due_date
--   overdue_days = whole days past the due date (0 if not due yet)
-- A view stores the query, not the rows: it is worked out fresh every time
-- it is read, so it always shows today's open loans and today's overdue days.
-- CREATE OR REPLACE means running this file again just updates the view.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW Member_Open_Loans AS
SELECT l.Loan_id,
       l.Member_id,
       ci.Title                                  AS title,
       ci.Item_type                              AS item_type,
       c.Barcode                                 AS barcode,
       l.Loan_type                               AS loan_type,
       DATE(l.Checkout_date)                     AS checkout_date,   -- drop the time of day
       l.Due_date                                AS due_date,
       l.Renewal_count                           AS renewal_count,
       -- DATEDIFF is negative while the loan is not due yet; GREATEST(..., 0) turns that into 0
       GREATEST(DATEDIFF(CURDATE(), l.Due_date), 0) AS overdue_days
  FROM Loan l
  JOIN Copy c         ON c.Copy_id  = l.Copy_id
  JOIN CatalogItem ci ON ci.Item_id = c.Item_id
 WHERE l.Return_date IS NULL;            -- still out
