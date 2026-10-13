-- =====================================================================
-- Trigger: trg_loan_overdue_fine
-- Purpose: when a loan is marked as returned AFTER its due date, MySQL
--          automatically (1) adds an 'overdue' fine and (2) sends the
--          member a 'fine_assessed' notification.
-- Rule:    $0.35 per day late, capped at $10.00 per item.
-- Safe to run more than once (it drops the old version first).
-- =====================================================================
USE library;

DROP TRIGGER IF EXISTS trg_loan_overdue_fine;

-- DELIMITER: the trigger body contains several ';' statements, so we
-- temporarily use $$ to mark where the whole CREATE TRIGGER ends.

DELIMITER $$

CREATE TRIGGER trg_loan_overdue_fine
AFTER UPDATE ON Loan            -- AFTER: the loan row is already saved when this runs
FOR EACH ROW                    -- runs once for every loan row that was updated
BEGIN

    -- Variables (DECLARE must come first, right after BEGIN)
    DECLARE days_late   INT;            -- how many days past the due date
    DECLARE fine_amount DECIMAL(6, 2);  -- matches Fine.Amount NUMERIC(6,2)

    -- Only act on the moment the item comes back:
    --   OLD.Return_date IS NULL      -> it was still open before this update
    --   NEW.Return_date IS NOT NULL  -> it now has a return date
    --   NEW.Return_date > NEW.Due_date -> and it was returned late
    -- Checking OLD stops a second fine if the row is edited again later.
    
    IF OLD.Return_date IS NULL
       AND NEW.Return_date IS NOT NULL
       AND NEW.Return_date > NEW.Due_date THEN

        -- Whole days between the due date and the return date
        SET days_late = DATEDIFF(NEW.Return_date, NEW.Due_date);

        -- $0.35 per day, but never more than $10.00 (LEAST = the smaller value)
        SET fine_amount = LEAST(days_late * 0.35, 10.00);

        -- Add the fine. Date_assessed, Is_paid and Date_paid fill in by default.
        INSERT INTO Fine (Loan_id, Fine_type, Amount)
        VALUES (NEW.Loan_id, 'overdue', fine_amount);

        -- Tell the member. Channel, Date_sent and Is_read fill in by default.
        INSERT INTO Notification (Member_id, Notification_type, Message)
        VALUES (NEW.Member_id,
                'fine_assessed',
                CONCAT('Overdue fine of $', fine_amount, ' for returning an item ',
                       days_late, ' day(s) late.'));
    END IF;
END$$

DELIMITER ;