-- trigger_hold_ready.sql - Area C (Farwa): hold becomes Ready when a copy is returned
-- Run after schema.sql and circulation.sql. Safe to run more than once.
-- Fires when a loan's Return_date goes from empty to filled in. It only touches
-- the hold and notification tables, so it does not interfere with the copy-status
-- trigger (Austin) or the overdue-fine trigger (Josh).
USE library;

DROP TRIGGER IF EXISTS trg_loan_hold_ready;

DELIMITER $$

CREATE TRIGGER trg_loan_hold_ready
AFTER UPDATE ON Loan
FOR EACH ROW
BEGIN
    DECLARE v_item_id INT;
    DECLARE v_hold_id INT;
    DECLARE v_member_id INT;
    DECLARE v_title VARCHAR(255);

    -- Only act at the moment the item comes back
    IF OLD.Return_date IS NULL AND NEW.Return_date IS NOT NULL THEN

        -- Which item does the returned copy belong to?
        SELECT c.Item_id, ci.Title INTO v_item_id, v_title
          FROM Copy c JOIN CatalogItem ci ON ci.Item_id = c.Item_id
         WHERE c.Copy_id = NEW.Copy_id;

        -- Oldest waiting (Active) hold for that item, if any
        SET v_hold_id = NULL;
        SELECT Hold_id, Member_id INTO v_hold_id, v_member_id
          FROM Hold
         WHERE Item_id = v_item_id AND Status = 'Active'
         ORDER BY Hold_date ASC, Hold_id ASC
         LIMIT 1;

        IF v_hold_id IS NOT NULL THEN
            -- Reserve the returned copy for 2 days
            UPDATE Hold
               SET Status = 'Ready',
                   Reserved_copy_id = NEW.Copy_id,
                   Expiry_date = CURDATE() + INTERVAL 2 DAY
             WHERE Hold_id = v_hold_id;

            -- Tell the member
            INSERT INTO Notification (Member_id, Notification_type, Message)
            VALUES (v_member_id, 'hold_ready',
                    CONCAT('Your hold on ', v_title,
                           ' is ready for pickup. It will be held for 2 days.'));
        END IF;
    END IF;
END$$

DELIMITER ;