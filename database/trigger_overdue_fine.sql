-- =====================================================================
-- Trigger: trg_loan_overdue_fine
-- Purpose: when a loan is marked as returned AFTER its due date, MySQL
--          automatically (1) adds an 'overdue' fine (or raises the one that grew while the item was
--          out) and (2) makes sure the member's notification for that fine says 'fine_assessed'
--          (Notification.Fine_id), see trigger_fine_notify.sql.
-- Rule:    $0.35 per day late, capped at $10.00 per item. If an overdue fine already exists for the
--          loan (created while the item was still out), it is updated rather than duplicated.
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
    DECLARE the_title   VARCHAR(255);   -- the item's title, for the notice
    DECLARE the_fine_id INT;            -- the fine this loan now has (new or raised), so the notice can point at it

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
        -- A loan can have only one 'overdue' fine (unique rule). If one was already created while the
        -- item was still out, raise it to the final amount instead (GREATEST = never lower it).
        INSERT INTO Fine (Loan_id, Fine_type, Amount)
        VALUES (NEW.Loan_id, 'overdue', fine_amount)
        ON DUPLICATE KEY UPDATE Amount = GREATEST(Amount, fine_amount);

        -- Find that fine's id (a loan has at most one 'overdue' fine, so this is exactly one row).
        SELECT Fine_id INTO the_fine_id
          FROM Fine
         WHERE Loan_id = NEW.Loan_id AND Fine_type = 'overdue';

        -- The title for the notice (the loan's copy belongs to one catalog item).
        SELECT ci.Title INTO the_title
          FROM Copy c JOIN CatalogItem ci ON ci.Item_id = c.Item_id
         WHERE c.Copy_id = NEW.Copy_id;

        -- Tell the member. Normally the fine already has a notice, made by trg_fine_overdue_notify
        -- (trigger_fine_notify.sql) when the fine was added, or while the item was still out. Then that
        -- notice is changed to the final wording and shown again as unread. If it has none, make one.
        -- Fine_id links the notice to the fine, so when the fine is paid or waived
        -- (trg_fine_paid in trigger_fine_paid.sql) the notice is closed too.
        IF EXISTS (SELECT 1 FROM Notification
                    WHERE Fine_id = the_fine_id AND Notification_type IN ('overdue', 'fine_assessed')) THEN
            UPDATE Notification
               SET Notification_type = 'fine_assessed',
                   Is_read = FALSE,
                   Date_sent = CURRENT_TIMESTAMP,
                   Message = CONCAT('Overdue fine of $', fine_amount, ' for returning "', LEFT(the_title, 80), '" ',
                                    days_late, ' day(s) late.')
             WHERE Fine_id = the_fine_id AND Notification_type IN ('overdue', 'fine_assessed');
        ELSE
            INSERT INTO Notification (Member_id, Notification_type, Fine_id, Message)
            VALUES (NEW.Member_id,
                    'fine_assessed',
                    the_fine_id,
                    CONCAT('Overdue fine of $', fine_amount, ' for returning "', LEFT(the_title, 80), '" ',
                           days_late, ' day(s) late.'));
        END IF;
    END IF;
END$$

DELIMITER ;