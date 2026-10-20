-- =====================================================================
-- Trigger: trg_loan_hold_completed
-- Purpose: when a member checks out the copy that was set aside for them,
--          MySQL automatically marks their hold as 'Completed' (picked up).
-- Rule:    a hold becomes 'Ready' when the item is returned
--          (trg_loan_hold_ready in trigger_hold_ready.sql) and names the
--          reserved copy in Reserved_copy_id. When a new loan is created for
--          that same member and that same copy, the hold has done its job.
--          Only a 'Ready' hold is changed, so a member's old Cancelled or
--          Expired holds that point at the same copy are left alone.
-- Works with: Austin's checkout (routes/circulation.js) lets only the hold's
--          owner take a reserved copy; this trigger then closes the hold.
--          Once it is 'Completed' the hold no longer counts as open, so the
--          member can place a new hold on the same item later.
-- Safe to run more than once (it drops the old version first).
-- Load order: schema.sql, seed_accounts.sql, trigger_overdue_fine.sql,
--          Sample_data.sql, circulation.sql, trigger_hold_ready.sql,
--          then this file, then reports.sql.
-- =====================================================================
USE library;

DROP TRIGGER IF EXISTS trg_loan_hold_completed;

-- DELIMITER: the trigger body ends with ';', so we temporarily use $$ to
-- mark where the whole CREATE TRIGGER ends.
DELIMITER $$

CREATE TRIGGER trg_loan_hold_completed
AFTER INSERT ON Loan            -- a checkout adds a new Loan row
FOR EACH ROW                    -- runs once for every loan row that was added
BEGIN
    -- No IF and no variables needed. If no hold matches,
    -- this UPDATE simply changes zero rows.
    -- NEW means "the loan row that was just added".
    UPDATE Hold
       SET Status = 'Completed'             -- what a picked-up hold becomes
     WHERE Member_id        = NEW.Member_id -- the member on the new loan
       AND Reserved_copy_id = NEW.Copy_id   -- the copy on the new loan
       AND Status           = 'Ready';      -- only a hold that was waiting for pickup
END$$

DELIMITER ;
