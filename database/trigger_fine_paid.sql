-- =====================================================================
-- Trigger: trg_fine_paid
-- Purpose: keeps the Fines and Notifications tables in sync. When a fine goes from
--          unpaid to paid (or waived), MySQL automatically
--          (1) marks the member's earlier 'fine_assessed' notice(s) for that fine as read,
--              so nobody is told they owe money for a fine that is settled, and
--          (2) sends the member a short 'fine_paid' or 'fine_waived' notice.
-- Why:     the Checkpoint #3 feedback said a member could see a notification about a
--          fine even though the Fines tab showed nothing outstanding. Doing it in a
--          trigger means every way of settling a fine is covered: a member paying, staff
--          pressing Pay, or an admin pressing Waive (routes/fines.js) all update the Fine
--          row, and this trigger reacts to that one change.
-- How it tells paid from waived: the Waive button saves Amount = 0 together with Is_paid = TRUE
--          (routes/fines.js), so Amount = 0 means waived. The original amount is in OLD.Amount.
-- Needs:   Notification.Fine_id (schema.sql) and the 'fine_paid' / 'fine_waived' notice types.
-- Safe to run more than once (it drops the old version first).
-- =====================================================================
USE library;

DROP TRIGGER IF EXISTS trg_fine_paid;

-- DELIMITER: the trigger body contains several ';' statements, so we
-- temporarily use $$ to mark where the whole CREATE TRIGGER ends.
DELIMITER $$

CREATE TRIGGER trg_fine_paid
AFTER UPDATE ON Fine            -- AFTER: the fine row is already saved when this runs
FOR EACH ROW                    -- runs once for every fine row that was updated
BEGIN
    DECLARE the_member_id INT;  -- who owns the loan this fine belongs to

    -- Only act at the moment the fine becomes settled:
    --   OLD.Is_paid = FALSE -> it was unpaid before this update
    --   NEW.Is_paid = TRUE  -> and it is paid (or waived) now
    -- Checking OLD stops a second notice if the row is edited again later.
    IF OLD.Is_paid = FALSE AND NEW.Is_paid = TRUE THEN

        -- A fine belongs to a loan, and a loan belongs to a member.
        SELECT Member_id INTO the_member_id FROM Loan WHERE Loan_id = NEW.Loan_id;

        -- (1) The "you have a fine" notice is out of date now: mark it read.
        UPDATE Notification
           SET Is_read = TRUE
         WHERE Fine_id = NEW.Fine_id
           AND Notification_type = 'fine_assessed';

        -- (2) Tell the member how it ended. Waived fines have Amount = 0.
        IF NEW.Amount = 0 THEN
            INSERT INTO Notification (Member_id, Notification_type, Fine_id, Message)
            VALUES (the_member_id, 'fine_waived', NEW.Fine_id,
                    CONCAT('Your ', NEW.Fine_type, ' fine of $', OLD.Amount, ' was waived. You owe nothing for it.'));
        ELSE
            INSERT INTO Notification (Member_id, Notification_type, Fine_id, Message)
            VALUES (the_member_id, 'fine_paid', NEW.Fine_id,
                    CONCAT('Your ', NEW.Fine_type, ' fine of $', NEW.Amount, ' was paid. Thank you.'));
        END IF;
    END IF;
END$$

DELIMITER ;
