-- =====================================================================
-- Triggers: trg_fine_overdue_notify (after a fine is added) and
--           trg_fine_overdue_update (after a fine's amount grows)
-- Purpose: when an overdue fine is GENERATED, MySQL automatically puts a notice in the
--          member's Notification table, so the member sees it the next time they open the
--          app (the home page shows their unread notices right under the search bar).
-- Why two triggers: an overdue fine now starts the day after the due date and grows by $0.35
--          every day while the item is still out (the app adds it, see lib/overdueFines.js).
--          The first one is the moment the fine is created (INSERT), the second one is
--          every later day the fine goes up (UPDATE). Together a loan has ONE notice that
--          is created once and then kept up to date, instead of a new notice every day.
-- Notice types: 'overdue'       = the item is still out and the fine is still growing
--               'fine_assessed' = the item came back late, so the fine is final
--               (trg_loan_overdue_fine in trigger_overdue_fine.sql changes the first into the second,
--                and trg_fine_paid in trigger_fine_paid.sql closes either one when the fine is settled)
-- Needs:   schema.sql (Fine, Loan, Copy, CatalogItem, Notification.Fine_id)
-- Safe to run more than once (it drops the old versions first).
-- =====================================================================
USE library;

DROP TRIGGER IF EXISTS trg_fine_overdue_notify;
DROP TRIGGER IF EXISTS trg_fine_overdue_update;

-- DELIMITER: each trigger body contains several ';' statements, so we
-- temporarily use $$ to mark where a whole CREATE TRIGGER ends.
DELIMITER $$

-- ---------------------------------------------------------------------
-- 1. A new overdue fine was added -> create the member's notice.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_fine_overdue_notify
AFTER INSERT ON Fine            -- AFTER: the fine row is already saved when this runs
FOR EACH ROW                    -- runs once for every fine row that was added
BEGIN
    -- Variables (DECLARE must come first, right after BEGIN)
    DECLARE the_member_id INT;            -- who borrowed the item
    DECLARE the_title     VARCHAR(255);   -- the title of the item
    DECLARE the_due       DATE;           -- when it was due
    DECLARE the_return    DATE;           -- when it came back (NULL = still out)
    DECLARE days_late     INT;            -- whole days past the due date

    -- Only overdue fines that still have to be paid get a notice here.
    -- (Damaged and lost fines are added by staff at the desk, who tell the member in person.)
    IF NEW.Fine_type = 'overdue' AND NEW.Is_paid = FALSE THEN

        -- A fine belongs to a loan, the loan to a member, and the loan's copy to a title.
        SELECT l.Member_id, ci.Title, l.Due_date, l.Return_date
          INTO the_member_id, the_title, the_due, the_return
          FROM Loan l
          JOIN Copy c         ON c.Copy_id = l.Copy_id
          JOIN CatalogItem ci ON ci.Item_id = c.Item_id
         WHERE l.Loan_id = NEW.Loan_id;

        -- Days late: up to the return date if it came back, up to today if it is still out.
        SET days_late = DATEDIFF(COALESCE(the_return, CURDATE()), the_due);

        -- LEFT(title, 80) keeps a very long title from making the message longer than 255 characters.
        -- Channel, Date_sent and Is_read fill in by default (unread, so it shows on the home page).
        IF the_return IS NULL THEN
            INSERT INTO Notification (Member_id, Notification_type, Fine_id, Message)
            VALUES (the_member_id, 'overdue', NEW.Fine_id,
                    CONCAT('"', LEFT(the_title, 80), '" is ', days_late, ' day(s) overdue. Fine so far: $',
                           NEW.Amount, ' (it grows $0.35 a day, up to $10.00). Return it to stop the fine growing.'));
        ELSE
            INSERT INTO Notification (Member_id, Notification_type, Fine_id, Message)
            VALUES (the_member_id, 'fine_assessed', NEW.Fine_id,
                    CONCAT('Overdue fine of $', NEW.Amount, ' for returning "', LEFT(the_title, 80), '" ',
                           days_late, ' day(s) late.'));
        END IF;
    END IF;
END$$

-- ---------------------------------------------------------------------
-- 2. An overdue fine went up (another day late) -> refresh the same notice and show it again.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_fine_overdue_update
AFTER UPDATE ON Fine            -- AFTER: the fine row is already saved when this runs
FOR EACH ROW                    -- runs once for every fine row that was updated
BEGIN
    DECLARE the_member_id INT;
    DECLARE the_title     VARCHAR(255);
    DECLARE the_due       DATE;
    DECLARE the_return    DATE;
    DECLARE days_late     INT;
    DECLARE the_message   VARCHAR(255);   -- the new wording of the notice

    -- Only act when an unpaid overdue fine changes its amount. Paying or waiving a fine is
    -- handled by trg_fine_paid, so both OLD and NEW must still be unpaid here.
    IF NEW.Fine_type = 'overdue'
       AND OLD.Is_paid = FALSE AND NEW.Is_paid = FALSE
       AND NEW.Amount <> OLD.Amount THEN

        SELECT l.Member_id, ci.Title, l.Due_date, l.Return_date
          INTO the_member_id, the_title, the_due, the_return
          FROM Loan l
          JOIN Copy c         ON c.Copy_id = l.Copy_id
          JOIN CatalogItem ci ON ci.Item_id = c.Item_id
         WHERE l.Loan_id = NEW.Loan_id;

        SET days_late = DATEDIFF(COALESCE(the_return, CURDATE()), the_due);

        IF the_return IS NULL THEN
            SET the_message = CONCAT('"', LEFT(the_title, 80), '" is ', days_late, ' day(s) overdue. Fine so far: $',
                                     NEW.Amount, ' (it grows $0.35 a day, up to $10.00). Return it to stop the fine growing.');
        ELSE
            SET the_message = CONCAT('Overdue fine of $', NEW.Amount, ' for returning "', LEFT(the_title, 80), '" ',
                                     days_late, ' day(s) late.');
        END IF;

        IF EXISTS (SELECT 1 FROM Notification
                    WHERE Fine_id = NEW.Fine_id AND Notification_type IN ('overdue', 'fine_assessed')) THEN
            -- Same notice, new numbers. Is_read = FALSE and a new Date_sent put it back on top of the
            -- member's home page, so a fine that grew is not missed just because the old wording was read.
            UPDATE Notification
               SET Message = the_message,
                   Notification_type = IF(the_return IS NULL, 'overdue', 'fine_assessed'),
                   Is_read = FALSE,
                   Date_sent = CURRENT_TIMESTAMP
             WHERE Fine_id = NEW.Fine_id AND Notification_type IN ('overdue', 'fine_assessed');
        ELSE
            -- A fine from before these triggers existed has no notice yet: make one.
            INSERT INTO Notification (Member_id, Notification_type, Fine_id, Message)
            VALUES (the_member_id, IF(the_return IS NULL, 'overdue', 'fine_assessed'), NEW.Fine_id, the_message);
        END IF;
    END IF;
END$$

DELIMITER ;
