// =====================================================================
// routes/circulation.js
// Circulation: lending items out, taking them back, and extending loans.
//
// Routes in this file (app.js adds the "/api/circulation" part):
//   POST /api/circulation/checkout    staff only   lend a copy to a member
//   POST /api/circulation/return      staff only   take a copy back
//   POST /api/circulation/renew       staff only   give a loan 14 more days
//   GET  /api/circulation/open-loans  logged in    what a member has out
//
// The pages that call these routes are in public/circulation/.
//
// How every route here works:
//   1. Read and clean the input sent by the page.
//   2. Check the lending rules against the database.
//   3. If a rule is broken, send back a clear message (status 400).
//   4. Otherwise save the change and send back a success message.
//
// The database does some work on its own (database/circulation.sql and
// database/trigger_overdue_fine.sql):
//   - a new loan sets the copy's Status to 'on loan'
//   - a returned loan sets the copy's Status back to 'available'
//   - a late return adds an overdue fine and a notification
// =====================================================================

// Express's Router: a small "mini-app" that holds a group of routes.
const { Router } = require('../lib/router');   // our own small router (lib/router.js)
const router = Router();

// The database connection pool (config/db.js). db.query(...) runs one SQL
// statement; db.getConnection() borrows a single connection for several.
const db = require('../config/db');

// Juan's login checks (middleware/auth.js). Putting one of these before a
// route's handler means the handler only runs if the check passes.
// isStaff: lets the request through only for logged-in staff.
// isAuthenticated: any logged-in user (used by the open loans list).
const { isStaff, isAuthenticated } = require('../middleware/auth');

// ---------------------------------------------------------------------
// Lending rules from the mini-world, kept in one place so they are easy
// to find and change.
// ---------------------------------------------------------------------

// Item types that count toward a member's media limit (mini-world rule).
// Books, newspapers and research papers are not media.
const MEDIA_TYPES = ['videogame', 'dvd', 'music', 'boardgame'];

// A member who owes more than this in unpaid fines cannot borrow.
const MAX_UNPAID_FINES = 2.50;

// Loan lengths in days.
const SHORT_LOAN_DAYS = 3;      // only 1 copy available: short loan, no renewal
const STANDARD_LOAN_DAYS = 14;  // 2 or more copies available: standard loan

// Thrown when a circulation rule is broken. Its message is written for the
// staff member at the desk and is sent back to the page as is.
// Having our own error type lets the catch blocks below tell the difference
// between "a rule said no" (show the message, status 400) and "something
// actually went wrong" (log it, show a generic message, status 500).
class RuleError extends Error {}

// Reads one text field from a form or the address bar, trimmed. Anything
// that is not text (missing, a number, or a value given twice) becomes '',
// so the route answers "Enter ..." instead of crashing.
function textField(value) {
    return typeof value === 'string' ? value.trim() : '';
}

// ---------------------------------------------------------------------
// POST /api/circulation/checkout
// Body: { barcode, member }   member = the member's username or email
// Checks every lending rule, then saves the Loan with the logged-in
// staff member's id. Staff only.
// ---------------------------------------------------------------------
router.post('/checkout', isStaff, async (req, res) => {
    // req.body holds what the page sent. "?." means: if there is no body at all,
    // give undefined instead of crashing (textField then turns it into '').
    const barcode = textField(req.body?.barcode).toUpperCase();   // barcodes are stored in upper case (LIB-0001), so lib-0001 finds the same copy
    const memberText = textField(req.body?.member);
    const staffId = req.session.userId;   // the staff member processing the checkout

    // Both boxes must be filled in before we bother the database.
    if (!barcode || !memberText) {
        return res.status(400).json({ message: 'Enter both a copy barcode and a member.' });
    }

    // All the checks and the insert run on one connection inside a
    // transaction, so they see the same data and either all happen or none do.
    // "let" (not const) because it is filled in inside the try block below.
    let conn;

    try {
        // Borrow one connection from the pool and start the transaction.
        // Nothing we save is final until conn.commit() near the end.
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 1. Find the member and their borrowing limits.
        // The JOIN brings in the member's type (Student, Faculty, ...) and its limits.
        // The "?" placeholders are filled from the array after the SQL, so whatever
        // was typed is never pasted into the SQL itself (prevents SQL injection).
        // FOR UPDATE OF m locks this member's row (only the Member row, "m") until we
        // finish, so two checkouts for the same member at the same moment cannot both
        // slip under a limit. The second one waits here until the first is done.
        const [members] = await conn.query(
            `SELECT m.Member_id, m.First_name, m.Last_name, m.Is_active, m.Staff_id,
                    mt.Type_name, mt.Max_loans, mt.Max_media_loans
               FROM Member m
               JOIN MemberType mt ON mt.Member_type_id = m.Member_type_id
              WHERE m.Username = ? OR m.Email = ?
              LIMIT 1
                FOR UPDATE OF m`,
            [memberText, memberText]);
        // query() gives back a list of rows. We asked for at most one (LIMIT 1),
        // so take the first; it is undefined if nobody matched.
        const member = members[0];

        if (!member) {
            throw new RuleError(`No member found with username or email "${memberText}".`);
        }
        const memberName = `${member.First_name} ${member.Last_name}`;

        // Deactivated members keep their history but cannot borrow.
        if (!member.Is_active) {
            throw new RuleError(`${memberName}'s account is not active, so they cannot borrow.`);
        }

        // A library employee who borrows must be checked out by a different staff member.
        // Member.Staff_id is only filled in when the member is also an employee, so
        // this matches when the logged-in staff member is checking out to themselves.
        if (member.Staff_id !== null && member.Staff_id === staffId) {
            throw new RuleError('You cannot check out items to yourself. A different staff member must process this checkout.');
        }

        // 2. Find the copy by its barcode, with its item's title and type.
        // FOR UPDATE OF c locks just this copy's row, so two staff cannot lend
        // the same copy at the same moment.
        const [copies] = await conn.query(
            `SELECT c.Copy_id, c.Item_id, c.Status, ci.Title, ci.Item_type
               FROM Copy c
               JOIN CatalogItem ci ON ci.Item_id = c.Item_id
              WHERE c.Barcode = ?
                FOR UPDATE OF c`,
            [barcode]);
        const copy = copies[0];

        if (!copy) {
            throw new RuleError(`No copy found with barcode "${barcode}".`);
        }
        // Status is 'available', 'on loan', 'lost' or 'withdrawn'. Only the first can be lent.
        if (copy.Status !== 'available') {
            throw new RuleError(`"${copy.Title}" (${barcode}) cannot be checked out because it is ${copy.Status}.`);
        }

        // The copy must not already be on an open loan (a loan with no return date).
        // The Status check above normally catches this; this is a second safety check
        // in case a Status was ever edited by hand.
        const [openLoans] = await conn.query(
            'SELECT Loan_id FROM Loan WHERE Copy_id = ? AND Return_date IS NULL',
            [copy.Copy_id]);
        if (openLoans.length > 0) {
            throw new RuleError(`"${copy.Title}" (${barcode}) is already checked out.`);
        }

        // The copy must not be set aside for someone else's Ready hold.
        // (A Ready hold names the exact copy waiting for that member in Reserved_copy_id.
        // "Member_id <> ?" skips the borrower's own hold: they are allowed to take it.)
        const [otherHolds] = await conn.query(
            `SELECT Hold_id FROM Hold
              WHERE Reserved_copy_id = ? AND Status = 'Ready' AND Member_id <> ?`,
            [copy.Copy_id, member.Member_id]);
        if (otherHolds.length > 0) {
            throw new RuleError(`"${copy.Title}" (${barcode}) is reserved for another member's hold.`);
        }

        // 3. Unpaid fines. Fines belong to loans, so join through Loan to reach the member.
        // SUM adds up every unpaid fine; COALESCE turns "no fines at all" (NULL) into 0.
        // "const [[fines]]" takes the first row of the result in one step.
        const [[fines]] = await conn.query(
            `SELECT COALESCE(SUM(f.Amount), 0) AS unpaid_total
               FROM Fine f
               JOIN Loan l ON l.Loan_id = f.Loan_id
              WHERE l.Member_id = ? AND f.Is_paid = FALSE`,
            [member.Member_id]);
        const unpaid = Number(fines.unpaid_total);   // MySQL sends DECIMAL as text

        // "More than $2.50" means exactly $2.50 is still allowed.
        if (unpaid > MAX_UNPAID_FINES) {
            throw new RuleError(`${memberName} owes $${unpaid.toFixed(2)} in unpaid fines. ` +
                `Members who owe more than $${MAX_UNPAID_FINES.toFixed(2)} cannot borrow.`);
        }

        // 4. Loan limits for the member's type: total open loans, and open media loans.
        // COUNT(*) counts every open loan. "ci.Item_type IN (?)" is 1 for a media item
        // and 0 otherwise, so SUM of it counts only the media loans. mysql2 turns the
        // MEDIA_TYPES list into 'videogame', 'dvd', 'music', 'boardgame' for the IN (?).
        const [[counts]] = await conn.query(
            `SELECT COUNT(*) AS total_loans,
                    COALESCE(SUM(ci.Item_type IN (?)), 0) AS media_loans
               FROM Loan l
               JOIN Copy c ON c.Copy_id = l.Copy_id
               JOIN CatalogItem ci ON ci.Item_id = c.Item_id
              WHERE l.Member_id = ? AND l.Return_date IS NULL`,
            [MEDIA_TYPES, member.Member_id]);
        const totalLoans = Number(counts.total_loans);
        const mediaLoans = Number(counts.media_loans);

        // ">=" because this checkout would be one more: at the limit already means no.
        if (totalLoans >= member.Max_loans) {
            throw new RuleError(`${memberName} already has ${totalLoans} item(s) out, ` +
                `the limit for ${member.Type_name} members (${member.Max_loans}).`);
        }

        // The media limit only matters when the item being borrowed is media.
        const isMedia = MEDIA_TYPES.includes(copy.Item_type);
        if (isMedia && mediaLoans >= member.Max_media_loans) {
            throw new RuleError(`${memberName} already has ${mediaLoans} media item(s) out, ` +
                `the media limit for ${member.Type_name} members (${member.Max_media_loans}).`);
        }

        // 5. Pick the loan type from how many copies of this item can be lent right now
        // (available, not on an open loan, not held for another member). That count
        // includes the copy being checked out.
        // "NOT EXISTS (SELECT 1 ...)" means "there is no such row": no open loan for the
        // copy, and no Ready hold that sets the copy aside for someone else.
        const [[available]] = await conn.query(
            `SELECT COUNT(*) AS copies
               FROM Copy c
              WHERE c.Item_id = ?
                AND c.Status = 'available'
                AND NOT EXISTS (SELECT 1 FROM Loan l
                                 WHERE l.Copy_id = c.Copy_id AND l.Return_date IS NULL)
                AND NOT EXISTS (SELECT 1 FROM Hold h
                                 WHERE h.Reserved_copy_id = c.Copy_id
                                   AND h.Status = 'Ready' AND h.Member_id <> ?)`,
            [copy.Item_id, member.Member_id]);

        // This copy is the last one on the shelf -> short loan; otherwise standard.
        const loanType = available.copies >= 2 ? 'standard' : 'short';
        const loanDays = loanType === 'standard' ? STANDARD_LOAN_DAYS : SHORT_LOAN_DAYS;

        // 6. Save the loan. MySQL fills in Checkout_date (now) and Open_copy_id itself,
        // so neither is written here. The due date is worked out in MySQL too, so it
        // uses the same clock as Checkout_date.
        // Saving this row also fires trg_loan_checkout_copy_status, which sets the
        // copy's Status to 'on loan'.
        const [result] = await conn.query(
            `INSERT INTO Loan (Copy_id, Member_id, Staff_id, Loan_type, Due_date)
             VALUES (?, ?, ?, ?, CURDATE() + INTERVAL ? DAY)`,
            [copy.Copy_id, member.Member_id, staffId, loanType, loanDays]);

        // Read the saved due date back as plain text (YYYY-MM-DD) for the page.
        // result.insertId is the Loan_id MySQL just gave the new row.
        const [[loan]] = await conn.query(
            `SELECT Loan_id, Loan_type, DATE_FORMAT(Due_date, '%Y-%m-%d') AS due_date
               FROM Loan WHERE Loan_id = ?`,
            [result.insertId]);

        // Every check passed and the loan is saved: make it permanent.
        await conn.commit();

        // 201 = "created": a new loan now exists. The page shows "message";
        // "loan" carries the details in case a page wants to show more.
        res.status(201).json({
            message: `Checked out "${copy.Title}" to ${memberName}. ` +
                `${loanType === 'standard' ? 'Standard' : 'Short'} loan, due ${loan.due_date}.`,
            loan: {
                loanId: loan.Loan_id,
                loanType: loan.Loan_type,
                dueDate: loan.due_date,
                title: copy.Title,
                barcode,
                member: memberName
            }
        });
    } catch (err) {
        // Undo anything half-done. The connection may be missing (or broken) if the
        // database is down, so a failed rollback is ignored.
        if (conn) await conn.rollback().catch(() => {});

        // A broken lending rule: tell the staff member exactly which one.
        if (err instanceof RuleError) {
            return res.status(400).json({ message: err.message });
        }

        // The database's one-open-loan-per-copy rule caught a checkout that
        // happened at the same moment as this one.
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This copy was just checked out by someone else.' });
        }

        // Anything else is a real problem (database down, a bug). Print the details
        // in the terminal for us, and send a short generic message to the page.
        console.error('Checkout failed:', err);
        res.status(500).json({ message: 'Checkout failed. Please try again.' });
    } finally {
        // Always hand the connection back to the pool (runs after success or failure).
        if (conn) conn.release();
    }
});

// The three ways a copy can come back, sent by the return page's dropdown.
//   ok      -> normal return
//   damaged -> still ours, but the copy's Condition becomes 'damaged' and the
//              member owes the item's replacement cost
//   lost    -> the copy is gone: Status becomes 'lost' (nobody can borrow it)
//              and the member owes the replacement cost
const RETURN_OUTCOMES = ['ok', 'damaged', 'lost'];

// ---------------------------------------------------------------------
// POST /api/circulation/return
// Body: { barcode, outcome }   outcome = 'ok' | 'damaged' | 'lost'
// Closes the copy's open loan: Return_date (today) and Return_staff_id
// (the logged-in staff member) are saved together, because the database
// requires both or neither. If the item is late, the trigger
// trg_loan_overdue_fine adds the overdue fine; this route only reads it back.
// For a damaged or lost return the route itself marks the copy and adds a
// 'damaged'/'lost' fine equal to the item's replacement cost. A lost item is
// paid for in full, so any overdue fine on a late return is waived. Staff only.
// ---------------------------------------------------------------------
router.post('/return', isStaff, async (req, res) => {
    const barcode = textField(req.body?.barcode).toUpperCase();   // barcodes are stored in upper case (LIB-0001), so lib-0001 finds the same copy
    // The dropdown choice, lower-cased. Missing/anything else becomes '' and is
    // rejected below, so the route never guesses what to do with the copy.
    const outcome = textField(req.body?.outcome).toLowerCase();
    const staffId = req.session.userId;   // the staff member checking the item in

    if (!barcode) {
        return res.status(400).json({ message: 'Enter the copy barcode.' });
    }
    // Only the three known choices are allowed (the page sends 'ok' by default).
    if (!RETURN_OUTCOMES.includes(outcome)) {
        return res.status(400).json({ message: 'Choose how the copy came back: OK, damaged, or lost.' });
    }

    // Same pattern as checkout: one connection, one transaction.
    let conn;

    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 1. Find the copy, then its open loan (if any).
        // Replacement_cost is read here so a damaged/lost fine can use it.
        const [copies] = await conn.query(
            `SELECT c.Copy_id, c.Item_id, ci.Title, ci.Replacement_cost
               FROM Copy c
               JOIN CatalogItem ci ON ci.Item_id = c.Item_id
              WHERE c.Barcode = ?`,
            [barcode]);
        const copy = copies[0];

        if (!copy) {
            throw new RuleError(`No copy found with barcode "${barcode}".`);
        }

        // The open loan is the one with no return date yet. DATEDIFF gives how many
        // days today is past the due date (0 or negative means on time).
        // FOR UPDATE OF l locks the loan row so the same item cannot be checked in
        // twice at the same moment; the second request waits, then finds no open loan.
        const [loans] = await conn.query(
            `SELECT l.Loan_id, l.Member_id, m.First_name, m.Last_name,
                    DATEDIFF(CURDATE(), l.Due_date) AS days_late
               FROM Loan l
               JOIN Member m ON m.Member_id = l.Member_id
              WHERE l.Copy_id = ? AND l.Return_date IS NULL
                FOR UPDATE OF l`,
            [copy.Copy_id]);
        const loan = loans[0];

        if (!loan) {
            throw new RuleError(`"${copy.Title}" (${barcode}) is not checked out, so there is nothing to return.`);
        }
        const memberName = `${loan.First_name} ${loan.Last_name}`;

        // 2. Damaged or lost: mark the copy and add the replacement-cost fine.
        // This runs BEFORE the loan is closed in step 3 on purpose:
        //   - Marking a 'lost' copy first means trg_loan_return_copy_status (which
        //     only moves a copy that is still 'on loan' back to 'available') leaves
        //     it out of circulation, and trg_loan_hold_ready sees the final copy
        //     state and skips handing a damaged/lost copy to the next member.
        //   - Fine_type is 'damaged' or 'lost', Amount is the item's
        //     Replacement_cost. The table allows one fine of each type per loan
        //     (uq_fine_loan_type), so returning the same loan twice cannot double it.
        let replacementFine = 0;   // 0 for an OK return; set below for damaged/lost
        if (outcome !== 'ok') {
            // A fine needs an amount (Fine.Amount is NOT NULL). If the item has no
            // replacement cost on file, stop with a message instead of guessing.
            if (copy.Replacement_cost === null) {
                throw new RuleError(`"${copy.Title}" (${barcode}) has no replacement cost on file, ` +
                    `so a ${outcome} fine cannot be added. Set its replacement cost first.`);
            }
            replacementFine = Number(copy.Replacement_cost);   // MySQL sends DECIMAL as text

            if (outcome === 'damaged') {
                // Still ours and still borrowable, just recorded as damaged.
                await conn.query(
                    "UPDATE Copy SET `Condition` = 'damaged' WHERE Copy_id = ?",
                    [copy.Copy_id]);
            } else {   // 'lost'
                // Gone: take it out of circulation so nobody can borrow it.
                await conn.query(
                    "UPDATE Copy SET Status = 'lost' WHERE Copy_id = ?",
                    [copy.Copy_id]);
            }

            // Add the fine against this loan. Date_assessed, Is_paid and Date_paid
            // fill in by default.
            await conn.query(
                'INSERT INTO Fine (Loan_id, Fine_type, Amount) VALUES (?, ?, ?)',
                [loan.Loan_id, outcome, replacementFine]);
        }

        // A lost item is paid for in full (its replacement cost), so the member is
        // not also charged the late fee. Closing a late loan fires
        // trg_loan_overdue_fine, which adds an overdue fine AND a 'fine_assessed'
        // notification; for a lost, late return we mark both as waived just below. Record the
        // latest notification id now so we change exactly the one the trigger adds.
        const waiveOverdue = outcome === 'lost' && loan.days_late > 0;
        let notifHighWater = 0;
        if (waiveOverdue) {
            const [[n]] = await conn.query('SELECT COALESCE(MAX(Notification_id), 0) AS maxId FROM Notification');
            notifHighWater = n.maxId;
        }

        // 3. Close the loan. Both columns in one UPDATE, so they are always filled in together.
        // MySQL clears Open_copy_id by itself once Return_date is set.
        // This UPDATE also fires these triggers:
        //   trg_loan_return_copy_status -> an 'on loan' copy's Status goes back to 'available'
        //   trg_loan_overdue_fine       -> if late, adds the overdue fine + a notification
        //   trg_loan_hold_ready         -> if a usable copy, sets it aside for the next waiting member
        await conn.query(
            `UPDATE Loan
                SET Return_date = CURDATE(), Return_staff_id = ?
              WHERE Loan_id = ?`,
            [staffId, loan.Loan_id]);

        // Lost item: waive the late fee the trigger just added. Nothing is deleted
        // (deleting is only a "mark", never a real removal): the overdue fine is set
        // to $0 and marked paid, which is the same way a staff waive works, and the
        // 'fine_assessed' notification the trigger added keeps its row but its text
        // now says the fine was waived. notifHighWater makes sure only the notification
        // added by this return is changed.
        if (waiveOverdue) {
            await conn.query(
                `UPDATE Fine
                    SET Amount = 0, Is_paid = TRUE, Date_paid = CURDATE()
                  WHERE Loan_id = ? AND Fine_type = 'overdue'`,
                [loan.Loan_id]);
            await conn.query(
                `UPDATE Notification
                    SET Message = 'The overdue fine was waived because the item was marked lost.'
                  WHERE Notification_id > ? AND Member_id = ? AND Notification_type = 'fine_assessed'`,
                [notifHighWater, loan.Member_id]);
        }

        // 4. If it came back late, the trigger has just added (or raised) the overdue fine.
        // fine is undefined when there is none (including a lost item, waived above).
        const [[fine]] = await conn.query(
            `SELECT Amount FROM Fine WHERE Loan_id = ? AND Fine_type = 'overdue'`,
            [loan.Loan_id]);

        // 5. Did this exact copy get set aside for a waiting member? trg_loan_hold_ready
        // reserves the returned copy for the next hold and names it in Reserved_copy_id.
        // A damaged/lost copy is skipped by that trigger, so this is 0 for those.
        const [[holds]] = await conn.query(
            `SELECT COUNT(*) AS reserved FROM Hold
              WHERE Reserved_copy_id = ? AND Status = 'Ready'`,
            [copy.Copy_id]);
        const reservedForHold = holds.reserved > 0;

        await conn.commit();

        // Build the message for the page, piece by piece.
        let message = `Returned "${copy.Title}" from ${memberName}.`;
        if (outcome === 'damaged') {
            message += ` Marked damaged; damaged fine: $${replacementFine.toFixed(2)}.`;
        } else if (outcome === 'lost') {
            message += ` Marked lost and taken out of circulation; lost fine: $${replacementFine.toFixed(2)}.`;
        }
        if (loan.days_late > 0) {
            message += ` It was ${loan.days_late} day(s) late`;
            if (waiveOverdue) {
                message += '; overdue fine waived because the item is lost.';
            } else {
                message += fine ? `; overdue fine: $${Number(fine.Amount).toFixed(2)}.` : '.';
            }
        } else {
            message += ' On time, no overdue fine.';
        }
        if (reservedForHold) {
            message += ' This copy is reserved for the next member\'s hold.';
        }

        res.json({
            message,
            loan: {
                loanId: loan.Loan_id,
                title: copy.Title,
                barcode,
                member: memberName,
                outcome,
                daysLate: Math.max(loan.days_late, 0),   // never negative (early = 0)
                fine: fine ? Number(fine.Amount) : 0,
                replacementFine,
                reservedForHold
            }
        });
    } catch (err) {
        // Undo anything half-done. The connection may be missing (or broken) if the
        // database is down, so a failed rollback is ignored.
        if (conn) await conn.rollback().catch(() => {});

        if (err instanceof RuleError) {
            return res.status(400).json({ message: err.message });
        }

        console.error('Return failed:', err);
        res.status(500).json({ message: 'Return failed. Please try again.' });
    } finally {
        if (conn) conn.release();
    }
});

// ---------------------------------------------------------------------
// POST /api/circulation/renew
// Body: { barcode }
// Renews the copy's open loan: adds 1 to Renewal_count and moves the due
// date out 14 days. Refused for short loans, when the member has used up
// their type's renewals, or when another member has an Active or Ready
// hold on the item. Staff only.
// ---------------------------------------------------------------------
router.post('/renew', isStaff, async (req, res) => {
    const barcode = textField(req.body?.barcode).toUpperCase();   // barcodes are stored in upper case (LIB-0001), so lib-0001 finds the same copy

    if (!barcode) {
        return res.status(400).json({ message: 'Enter the copy barcode.' });
    }

    // Same pattern as checkout: one connection, one transaction.
    let conn;

    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 1. Find the copy's open loan, with the member's renewal limit, in one query.
        // LEFT JOIN keeps the copy row even when it has no open loan, so we can tell
        // "no such barcode" (no row at all) apart from "not checked out" (row, but
        // the loan columns are empty).
        // FOR UPDATE OF l locks the loan row so it cannot be renewed twice at the same moment.
        const [loans] = await conn.query(
            `SELECT l.Loan_id, l.Member_id, l.Loan_type, l.Renewal_count,
                    c.Item_id, ci.Title,
                    m.First_name, m.Last_name,
                    mt.Type_name, mt.Max_renewals
               FROM Copy c
               JOIN CatalogItem ci ON ci.Item_id = c.Item_id
               LEFT JOIN Loan l    ON l.Copy_id = c.Copy_id AND l.Return_date IS NULL
               LEFT JOIN Member m  ON m.Member_id = l.Member_id
               LEFT JOIN MemberType mt ON mt.Member_type_id = m.Member_type_id
              WHERE c.Barcode = ?
                FOR UPDATE OF l`,
            [barcode]);
        const loan = loans[0];

        if (!loan) {
            throw new RuleError(`No copy found with barcode "${barcode}".`);
        }
        if (!loan.Loan_id) {
            throw new RuleError(`"${loan.Title}" (${barcode}) is not checked out, so it cannot be renewed.`);
        }
        const memberName = `${loan.First_name} ${loan.Last_name}`;

        // 2. Short loans (only copy on the shelf) cannot be renewed.
        if (loan.Loan_type !== 'standard') {
            throw new RuleError(`"${loan.Title}" is a short loan. Short loans cannot be renewed.`);
        }

        // 3. Renewal limit for the member's type (999 means no limit).
        if (loan.Renewal_count >= loan.Max_renewals) {
            throw new RuleError(`${memberName} has already renewed this loan ${loan.Renewal_count} time(s), ` +
                `the limit for ${loan.Type_name} members (${loan.Max_renewals}).`);
        }

        // 4. Someone else is waiting for this item. Holds are placed on the item (not one
        // copy), so any Active or Ready hold by another member blocks the renewal.
        const [[holds]] = await conn.query(
            `SELECT COUNT(*) AS waiting FROM Hold
              WHERE Item_id = ? AND Status IN ('Active', 'Ready') AND Member_id <> ?`,
            [loan.Item_id, loan.Member_id]);
        if (holds.waiting > 0) {
            throw new RuleError(`"${loan.Title}" cannot be renewed because another member has a hold on it.`);
        }

        // 5. Renew: one more renewal, due date 14 days later. Both change in one UPDATE,
        // so the database's due-date window check sees them together.
        // (That check allows 14 days per renewal on top of the first 14.)
        await conn.query(
            `UPDATE Loan
                SET Renewal_count = Renewal_count + 1,
                    Due_date = Due_date + INTERVAL ? DAY
              WHERE Loan_id = ?`,
            [STANDARD_LOAN_DAYS, loan.Loan_id]);

        // Read the new values back for the message.
        const [[renewed]] = await conn.query(
            `SELECT Renewal_count, DATE_FORMAT(Due_date, '%Y-%m-%d') AS due_date
               FROM Loan WHERE Loan_id = ?`,
            [loan.Loan_id]);

        await conn.commit();

        res.json({
            message: `Renewed "${loan.Title}" for ${memberName}. New due date: ${renewed.due_date} ` +
                `(renewal ${renewed.Renewal_count}).`,
            loan: {
                loanId: loan.Loan_id,
                title: loan.Title,
                barcode,
                member: memberName,
                dueDate: renewed.due_date,
                renewalCount: renewed.Renewal_count
            }
        });
    } catch (err) {
        // Undo anything half-done. The connection may be missing (or broken) if the
        // database is down, so a failed rollback is ignored.
        if (conn) await conn.rollback().catch(() => {});

        if (err instanceof RuleError) {
            return res.status(400).json({ message: err.message });
        }

        console.error('Renew failed:', err);
        res.status(500).json({ message: 'Renew failed. Please try again.' });
    } finally {
        if (conn) conn.release();
    }
});

// ---------------------------------------------------------------------
// GET /api/circulation/open-loans?member=<username or email>
// What is checked out and when it is due, soonest first (so overdue loans come first).
// Staff: with ?member= they see that one member's loans; without it they see EVERY
// open loan, each with the member's name. A logged-in member always sees only their
// own loans (the ?member= value is ignored for them).
// Reads the Member_Open_Loans view from database/circulation.sql.
// This route only reads, so it uses db.query directly: no transaction needed.
// ---------------------------------------------------------------------
router.get('/open-loans', isAuthenticated, async (req, res) => {
    try {
        let memberId;   // whose loans to show; decided below (stays undefined for "everyone")

        if (req.session.isStaff) {
            // Staff: the member typed into the page's lookup box, or nothing.
            // req.query holds the values after "?" in the address.
            const memberText = textField(req.query.member);

            if (!memberText) {
                // No member given: show every open loan, with who has it.
                // The view has no member name, so Member is joined on to add it.
                // Oldest due date first, so the loans that are most overdue are at the top.
                const [everyLoan] = await db.query(
                    `SELECT v.Loan_id, v.title, v.item_type, v.barcode, v.loan_type,
                            DATE_FORMAT(v.checkout_date, '%Y-%m-%d') AS checkout_date,
                            DATE_FORMAT(v.due_date, '%Y-%m-%d') AS due_date,
                            v.renewal_count, v.overdue_days,
                            CONCAT(m.First_name, ' ', m.Last_name) AS member_name,
                            m.Username AS member_username
                       FROM Member_Open_Loans v
                       JOIN Member m ON m.Member_id = v.Member_id
                      ORDER BY v.due_date, v.Loan_id`);
                return res.json({ all: true, member: 'All members', loans: everyLoan });
            }

            const [members] = await db.query(
                'SELECT Member_id FROM Member WHERE Username = ? OR Email = ? LIMIT 1',
                [memberText, memberText]);
            if (members.length === 0) {
                // 404 = "not found"
                return res.status(404).json({ message: `No member found with username or email "${memberText}".` });
            }
            memberId = members[0].Member_id;
        } else {
            // A member's session userId is their Member_id. Using the session (not the
            // address) means a member can never look at someone else's loans.
            memberId = req.session.userId;
        }

        // The member's name for the line above the table.
        const [[member]] = await db.query(
            'SELECT First_name, Last_name FROM Member WHERE Member_id = ?',
            [memberId]);

        // Member_Open_Loans already has one row per open loan, with the title,
        // barcode and overdue_days worked out (see database/circulation.sql).
        // DATE_FORMAT sends the dates as plain YYYY-MM-DD text.
        const [loans] = await db.query(
            `SELECT Loan_id, title, item_type, barcode, loan_type,
                    DATE_FORMAT(checkout_date, '%Y-%m-%d') AS checkout_date,
                    DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date,
                    renewal_count, overdue_days
               FROM Member_Open_Loans
              WHERE Member_id = ?
              ORDER BY due_date`,
            [memberId]);

        res.json({ all: false, member: `${member.First_name} ${member.Last_name}`, loans });
    } catch (err) {
        console.error('Open loans failed:', err);
        res.status(500).json({ message: 'Could not load open loans. Please try again.' });
    }
});

// Hand the router to app.js, which mounts it at /api/circulation.
module.exports = router;
