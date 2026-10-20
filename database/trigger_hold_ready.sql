-- =====================================================================
-- Trigger: trg_loan_hold_ready
-- Purpose: when a loan is marked as returned, MySQL automatically checks
--          whether another member is waiting for that item. If so it
--          (1) turns the oldest waiting hold into a 'Ready' hold, sets the
--          returned copy aside for that member, and gives them a 2-day
--          pickup window, and (2) sends that member a 'hold_ready'
--          notification.
-- Rule:    holds are served first come, first served: the waiting hold with
--          the oldest Hold_date wins. A hold is placed on the item, not on
--          one copy, so any copy of that item can satisfy it.
-- Works with: Austin's checkout (database/circulation.sql and
--          routes/circulation.js) already refuses to lend a copy that is
--          reserved by a Ready hold to anyone except the hold's owner, and
--          Farwa's search (routes/search.js) already hides such a copy from
--          the available-copies count. This trigger is what creates the
--          Ready hold they both look for.
-- Safe to run more than once (it drops the old version first).
-- Load order: schema.sql, seed_accounts.sql, trigger_overdue_fine.sql,
--          Sample_data.sql, circulation.sql, then this file, then reports.sql.
--          Sample_data.sql must come BEFORE circulation.sql: its loan inserts
--          look up the Copy table, and MySQL refuses a trigger that updates
--          Copy while the statement that fired it is still reading it.
-- =====================================================================
USE library;

DROP TRIGGER IF EXISTS trg_loan_hold_ready;

-- DELIMITER: the trigger body contains several ';' statements, so we
-- temporarily use $$ to mark where the whole CREATE TRIGGER ends.
DELIMITER $$

CREATE TRIGGER trg_loan_hold_ready
AFTER UPDATE ON Loan            -- AFTER: the loan row is already saved when this runs
FOR EACH ROW                    -- runs once for every loan row that was updated
BEGIN
    -- Variables (DECLARE must come first, right after BEGIN).
    -- Each one starts empty (NULL) every time the trigger runs.
    DECLARE the_item_id   INT;  -- which catalog item the returned copy belongs to
    DECLARE the_hold_id   INT;  -- the waiting hold that will become Ready
    DECLARE the_member_id INT;  -- the member who placed that hold

    -- Only act on the moment the item comes back:
    --   OLD.Return_date IS NULL      -> it was still open before this update
    --   NEW.Return_date IS NOT NULL  -> it now has a return date
    -- Checking OLD means a renewal, or any later edit of the loan, does nothing here.
    IF OLD.Return_date IS NULL
       AND NEW.Return_date IS NOT NULL THEN

        -- STEP 1: find which catalog item the returned copy belongs to.
        -- A loan only knows its Copy_id; the Item_id is stored on the copy.
        SELECT Item_id
          INTO the_item_id
          FROM Copy
         WHERE Copy_id = NEW.Copy_id;

        -- STEP 2: find who is first in line for that item.
        -- Only 'Active' holds are still waiting; the oldest Hold_date comes first
        -- (ORDER BY is ascending by default) and LIMIT 1 keeps just that one row.
        -- If nobody is waiting, no row matches and both variables stay empty
        -- (MySQL may show a harmless "No data" warning).
        SELECT Hold_id, Member_id
          INTO the_hold_id, the_member_id
          FROM Hold
         WHERE Item_id = the_item_id
           AND Status  = 'Active'
         ORDER BY Hold_date
         LIMIT 1;

        -- STEP 3: only if step 2 found someone.
        IF the_hold_id IS NOT NULL THEN

            -- Set the returned copy aside for that member. The schema requires a
            -- Ready hold to name its copy (Reserved_copy_id). The member has 2 days
            -- to pick it up, the same window the sample data uses.
            UPDATE Hold
               SET Status           = 'Ready',
                   Reserved_copy_id = NEW.Copy_id,
                   Expiry_date      = CURDATE() + INTERVAL 2 DAY
             WHERE Hold_id = the_hold_id;

            -- Tell the member. Channel, Date_sent and Is_read fill in by default.
            INSERT INTO Notification (Member_id, Notification_type, Message)
            VALUES (the_member_id,
                    'hold_ready',
                    'Your item is ready to pick up');

        END IF;
    END IF;
END$$

DELIMITER ;
