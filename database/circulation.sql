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
--   - Two ACTION triggers (1 and 2): SQL that MySQL runs by itself whenever a
--     Loan row is added or changed. They keep Copy.Status in step with the
--     loans, no matter which page (or person in Workbench) changed the loan.
--   - Five RULE (semantic) triggers (3 to 7): they enforce library rules that
--     table definitions cannot express because the rule looks at other tables
--     (fines, member type, open loans). They run BEFORE the change is saved
--     and, when a rule is broken, stop it with an error (SIGNAL).
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

-- Rule triggers (see the section "Rule (semantic) triggers" below).
DROP TRIGGER IF EXISTS trg_loan_rule_member_active;
DROP TRIGGER IF EXISTS trg_loan_rule_unpaid_fines;
DROP TRIGGER IF EXISTS trg_loan_rule_loan_limits;
DROP TRIGGER IF EXISTS trg_loan_rule_staff_borrower;
DROP TRIGGER IF EXISTS trg_loan_rule_renewals;

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

-- =====================================================================
-- Rule (semantic) triggers 3 to 7
-- These are different from triggers 1 and 2: they do not change other rows,
-- they CHECK a rule of the library and refuse the change when it is broken.
-- The app already checks the same rules and shows a friendly message
-- (routes/circulation.js). These triggers are the safety net inside the
-- database: a bad loan is refused even if it is typed straight into Workbench
-- or two checkouts happen at the same moment.
--
-- How a rule trigger works:
--   BEFORE INSERT/UPDATE : runs before the row is saved, so it can still stop it.
--   SIGNAL SQLSTATE '45000' : raises our own error, which cancels the change.
--   MESSAGE_TEXT : the error text (MySQL allows up to 128 characters).
-- Only OPEN loans are checked (Return_date empty), so old history rows that
-- are saved already returned (like in Sample_data.sql) are never refused.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Trigger 3: trg_loan_rule_member_active
-- Rule: an inactive (or deleted) member cannot borrow.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_loan_rule_member_active
BEFORE INSERT ON Loan
FOR EACH ROW
BEGIN
    -- v_ names are variables, so they never get mixed up with column names.
    DECLARE v_active  BOOLEAN;
    DECLARE v_deleted BOOLEAN;

    IF NEW.Return_date IS NULL THEN
        -- Read the borrower's flags into the two variables.
        SELECT Is_active, Is_deleted INTO v_active, v_deleted
          FROM Member
         WHERE Member_id = NEW.Member_id;

        IF v_active = FALSE OR v_deleted = TRUE THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Rule: an inactive member cannot borrow.';
        END IF;
    END IF;
END$$

-- ---------------------------------------------------------------------
-- Trigger 4: trg_loan_rule_unpaid_fines
-- Rule: a member who owes MORE than $2.50 in unpaid fines cannot borrow
-- (exactly $2.50 is still allowed).
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_loan_rule_unpaid_fines
BEFORE INSERT ON Loan
FOR EACH ROW
BEGIN
    DECLARE v_unpaid DECIMAL(10,2);

    IF NEW.Return_date IS NULL THEN
        -- A fine belongs to a loan and the loan to a member, so join Fine -> Loan.
        -- COALESCE turns "no unpaid fines at all" (NULL) into 0.
        SELECT COALESCE(SUM(f.Amount), 0) INTO v_unpaid
          FROM Fine f
          JOIN Loan l ON l.Loan_id = f.Loan_id
         WHERE l.Member_id = NEW.Member_id
           AND f.Is_paid = FALSE;

        IF v_unpaid > 2.50 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Rule: a member who owes more than $2.50 in unpaid fines cannot borrow.';
        END IF;
    END IF;
END$$

-- ---------------------------------------------------------------------
-- Trigger 5: trg_loan_rule_loan_limits
-- Rule: a member cannot have more open loans than their member type allows
-- (MemberType.Max_loans), and cannot have more open MEDIA loans than
-- MemberType.Max_media_loans. Media = videogame, dvd, music, boardgame.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_loan_rule_loan_limits
BEFORE INSERT ON Loan
FOR EACH ROW
BEGIN
    DECLARE v_max_loans  INT;           -- limit for this member's type
    DECLARE v_max_media  INT;
    DECLARE v_open       INT;           -- items the member has out right now
    DECLARE v_open_media INT;           -- how many of those are media
    DECLARE v_item_type  VARCHAR(20);   -- category of the item being borrowed now

    IF NEW.Return_date IS NULL THEN
        -- The limits come from the member's type.
        SELECT mt.Max_loans, mt.Max_media_loans INTO v_max_loans, v_max_media
          FROM Member m
          JOIN MemberType mt ON mt.Member_type_id = m.Member_type_id
         WHERE m.Member_id = NEW.Member_id;

        -- Count the member's open loans. (Item_type IN (...)) is 1 for a media item
        -- and 0 otherwise, so SUM of it counts only the media loans.
        SELECT COUNT(*),
               COALESCE(SUM(ci.Item_type IN ('videogame', 'dvd', 'music', 'boardgame')), 0)
          INTO v_open, v_open_media
          FROM Loan l
          JOIN Copy c         ON c.Copy_id  = l.Copy_id
          JOIN CatalogItem ci ON ci.Item_id = c.Item_id
         WHERE l.Member_id = NEW.Member_id
           AND l.Return_date IS NULL;

        -- What kind of item is this new loan for?
        SELECT ci.Item_type INTO v_item_type
          FROM Copy c
          JOIN CatalogItem ci ON ci.Item_id = c.Item_id
         WHERE c.Copy_id = NEW.Copy_id;

        -- ">=" because this loan would be one more: already at the limit means no.
        IF v_open >= v_max_loans THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Rule: the member already has the maximum number of open loans for their member type.';
        END IF;

        IF v_item_type IN ('videogame', 'dvd', 'music', 'boardgame')
           AND v_open_media >= v_max_media THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Rule: the member already has the maximum number of open media loans for their member type.';
        END IF;
    END IF;
END$$

-- ---------------------------------------------------------------------
-- Trigger 6: trg_loan_rule_staff_borrower
-- Rule: when a library employee borrows (their Member row is linked to their
-- Staff row), a DIFFERENT staff member must process the checkout.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_loan_rule_staff_borrower
BEFORE INSERT ON Loan
FOR EACH ROW
BEGIN
    DECLARE v_member_staff INT;         -- the borrower's own Staff id (NULL for a normal member)

    IF NEW.Return_date IS NULL THEN
        SELECT Staff_id INTO v_member_staff
          FROM Member
         WHERE Member_id = NEW.Member_id;

        -- Only compare when the borrower really is an employee (not NULL).
        IF v_member_staff IS NOT NULL AND v_member_staff = NEW.Staff_id THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Rule: a staff member cannot check out an item to themselves. A different staff member must do it.';
        END IF;
    END IF;
END$$

-- ---------------------------------------------------------------------
-- Trigger 7: trg_loan_rule_renewals
-- Rules for a renewal (a loan update where Renewal_count goes up):
--   - a SHORT loan can never be renewed
--   - the renewal count cannot pass the member type's limit
--     (MemberType.Max_renewals; 999 means no limit)
--   - a member who owes MORE than $2.50 in unpaid fines cannot renew
--   - nobody can renew an item while ANOTHER member has an open hold
--     (Active or Ready) on it, because that member is waiting for it
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_loan_rule_renewals
BEFORE UPDATE ON Loan
FOR EACH ROW
BEGIN
    DECLARE v_max_renewals INT;          -- renewals allowed for this member type
    DECLARE v_unpaid DECIMAL(10,2);      -- money the member owes in unpaid fines
    DECLARE v_waiting INT;               -- open holds placed by OTHER members

    -- Only look at updates that are a renewal (the count went up).
    IF NEW.Renewal_count > OLD.Renewal_count THEN
        IF NEW.Loan_type = 'short' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Rule: a short loan cannot be renewed.';
        END IF;

        SELECT mt.Max_renewals INTO v_max_renewals
          FROM Member m
          JOIN MemberType mt ON mt.Member_type_id = m.Member_type_id
         WHERE m.Member_id = NEW.Member_id;

        IF NEW.Renewal_count > v_max_renewals THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Rule: the member has used all the renewals allowed for their member type.';
        END IF;

        -- Unpaid fines: same sum as in trigger 4. COALESCE turns "no unpaid
        -- fines at all" (NULL) into 0. Exactly $2.50 is still allowed.
        SELECT COALESCE(SUM(f.Amount), 0) INTO v_unpaid
          FROM Fine f
          JOIN Loan l ON l.Loan_id = f.Loan_id
         WHERE l.Member_id = NEW.Member_id
           AND f.Is_paid = FALSE;

        IF v_unpaid > 2.50 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Rule: a member who owes more than $2.50 in unpaid fines cannot renew.';
        END IF;

        -- Holds are placed on the item, and a loan points to a copy, so go
        -- Copy -> Item. A hold from the borrower themselves does not count.
        SELECT COUNT(*) INTO v_waiting
          FROM Hold h
          JOIN Copy c ON c.Item_id = h.Item_id
         WHERE c.Copy_id = NEW.Copy_id
           AND h.Status IN ('Active', 'Ready')
           AND h.Member_id <> NEW.Member_id;

        IF v_waiting > 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Rule: this item cannot be renewed because another member has a hold on it.';
        END IF;
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
       c.Copy_id                                 AS copy_id,
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
