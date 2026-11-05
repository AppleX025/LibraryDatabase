// =====================================================================
// routes/reports.js
// Management reports (administrators only). Each report answers one business
// question for the library, and every one can be narrowed with filters:
//
//   GET /api/reports/options      the choices for the filter drop-downs
//   GET /api/reports/trends       Borrowing trends:     is demand rising or falling, and for what?
//   GET /api/reports/collection   Collection use:       which parts of the collection earn their shelf space?
//   GET /api/reports/late-fines   Late returns & fines: how big is the overdue problem, and are fines collected?
//   GET /api/reports/demand       Demand vs supply:     which titles need more copies?
//
// Filters (all optional, sent in the address as ?from=2026-09-01&to=2026-10-31&type=book&memberType=Student):
//   from, to      first and last day (YYYY-MM-DD). What they cut on depends on the report:
//                 the day an item was checked out (trends, collection, late-fines)
//                 or the day a hold was placed (demand).
//   type          item category: book, dvd, music, ...
//   memberType    Student, Faculty, ... (only the reports that look at members use it)
//
// Every report sends back JSON with the same shape:
//   { filters, summary: {...numbers for the tiles...}, tables: {...rows...}, chart: { labels: [...], values: [...] } }
// "chart" is the one data series that suits that report best, ready to hand to a chart library.
//
// The numbers are worked out here with SQL (COUNT, SUM, AVG, GROUP BY), not just listed, so the
// pages show comparisons, rates and changes instead of single database rows.
// Items, copies and members that were "deleted" in the app are left out of the lists of items,
// but the history itself (loans, fines) is counted, so past totals stay true.
// =====================================================================

const { Router } = require('../lib/router');   // our own small router (lib/router.js)
const router = Router();

// The database connection (a pool of MySQL connections set up in config/db.js).
const db = require('../config/db');

// isAdmin: checks that the person is logged in AND is an administrator. Reports are for
// managers (administrators) only; ordinary staff do circulation, not management reporting.
const { isAdmin } = require('../middleware/auth');

// Every report route below is for administrators only.
router.use(isAdmin);

// The item categories the catalog knows (same list as CatalogItem.Item_type in schema.sql).
// Used to check the ?type= filter, so only a real category ever reaches the SQL.
const ITEM_TYPES = ['book', 'videogame', 'boardgame', 'dvd', 'music', 'newspaper', 'researchpaper'];

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

// isRealDate(text): true for a real calendar date written YYYY-MM-DD (so 2026-02-31 is refused).
function isRealDate(text) {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const [y, m, d] = text.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// readFilters(query): turns the address's ?from=&to=&type=&memberType= into clean values.
// Anything missing is null ("no filter"). Throws an Error with a status 400 for a bad value,
// which the route turns into a plain message.
function readFilters(query) {
    const from = query.from ? String(query.from) : null;
    const to = query.to ? String(query.to) : null;
    const type = query.type ? String(query.type) : null;
    const memberType = query.memberType ? String(query.memberType) : null;

    if (from && !isRealDate(from)) throw Object.assign(new Error('"From" must be a real date.'), { status: 400 });
    if (to && !isRealDate(to)) throw Object.assign(new Error('"To" must be a real date.'), { status: 400 });
    if (from && to && from > to) throw Object.assign(new Error('"From" must not be after "To".'), { status: 400 });
    if (type && !ITEM_TYPES.includes(type)) throw Object.assign(new Error('Unknown item category.'), { status: 400 });
    // memberType is only ever used as a "?" value (never pasted into the SQL), so any text is safe.
    return { from, to, type, memberType };
}

// dateConditions(column, filters): the SQL pieces for the From / To filters on one date column.
// Returns { sql: ['DATE(col) >= ?', ...], values: [...] } to be joined with AND.
function dateConditions(column, filters) {
    const sql = [], values = [];
    if (filters.from) { sql.push(`DATE(${column}) >= ?`); values.push(filters.from); }
    if (filters.to)   { sql.push(`DATE(${column}) <= ?`); values.push(filters.to); }
    return { sql, values };
}

// loanFilter(filters, { memberType }): the WHERE conditions for reports built on loans.
// The query must join the tables as  Loan l, Copy c, CatalogItem ci, Member m, MemberType mt.
// Returns { where: 'WHERE ... ' or '', values: [...] }.
function loanFilter(filters, useMemberType) {
    const dates = dateConditions('l.Checkout_date', filters);
    const sql = [...dates.sql], values = [...dates.values];
    if (filters.type) { sql.push('ci.Item_type = ?'); values.push(filters.type); }
    if (useMemberType && filters.memberType) { sql.push('mt.Type_name = ?'); values.push(filters.memberType); }
    return { where: sql.length ? 'WHERE ' + sql.join(' AND ') : '', values };
}

// The tables every loan-based report starts from: a loan, its copy, the item, the member, the member's type.
const LOAN_JOINS = `
    FROM Loan l
    JOIN Copy c         ON c.Copy_id = l.Copy_id
    JOIN CatalogItem ci ON ci.Item_id = c.Item_id
    JOIN Member m       ON m.Member_id = l.Member_id
    JOIN MemberType mt  ON mt.Member_type_id = m.Member_type_id`;

// pct(part, whole): a percentage rounded to one decimal, or null when there is nothing to divide by.
function pct(part, whole) {
    return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

// round2(number): rounds to two decimals (money, averages). Null stays null.
function round2(value) {
    return value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100;
}

// sendError(res, error): answers with a short message. A bad filter (status 400) says what is wrong;
// anything else is logged for us and shown as a generic message.
function sendError(res, error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Report failed:', error);
    return res.status(500).json({ message: 'Could not build the report. Please try again.' });
}

// ---------------------------------------------------------------------
// GET /api/reports/options  -  what the filter drop-downs offer
// ---------------------------------------------------------------------
router.get('/options', async (req, res) => {
    try {
        const [types] = await db.query('SELECT Type_name FROM MemberType ORDER BY Member_type_id');
        res.json({ itemTypes: ITEM_TYPES, memberTypes: types.map(t => t.Type_name) });
    } catch (error) { sendError(res, error); }
});

// ---------------------------------------------------------------------
// GET /api/reports/trends  -  Borrowing trends
// Question: is demand rising or falling, and which kinds of items and members drive it?
// Month by month: loans, how many different people borrowed, late returns, and the change from
// the month before. Plus the share of loans by item category and by membership type.
// ---------------------------------------------------------------------
router.get('/trends', async (req, res) => {
    try {
        const filters = readFilters(req.query);
        const f = loanFilter(filters, true);

        // One row per month that has loans. SUM(condition) counts the rows where the condition is true.
        const [months] = await db.query(
            `SELECT DATE_FORMAT(l.Checkout_date, '%Y-%m') AS month,
                    COUNT(*)                                             AS loans,
                    COUNT(DISTINCT l.Member_id)                          AS borrowers,
                    SUM(l.Return_date IS NOT NULL AND l.Return_date > l.Due_date) AS late_returns
             ${LOAN_JOINS}
             ${f.where}
             GROUP BY month
             ORDER BY month`, f.values);

        // Fill in months with no loans at all (zero), so a quiet month shows as a drop, not a gap.
        const filled = [];
        if (months.length) {
            const byMonth = new Map(months.map(r => [r.month, r]));
            let [y, m] = months[0].month.split('-').map(Number);
            const [lastY, lastM] = months[months.length - 1].month.split('-').map(Number);
            while (y < lastY || (y === lastY && m <= lastM)) {
                const key = `${y}-${String(m).padStart(2, '0')}`;
                const row = byMonth.get(key);
                filled.push({ month: key, loans: row ? Number(row.loans) : 0,
                              borrowers: row ? Number(row.borrowers) : 0,
                              late_returns: row ? Number(row.late_returns) : 0 });
                m += 1; if (m > 12) { m = 1; y += 1; }
            }
        }
        // Change from the previous month, in percent (null for the first month or after a zero month).
        filled.forEach((row, i) => {
            const before = i > 0 ? filled[i - 1].loans : null;
            row.change_pct = before ? Math.round(((row.loans - before) / before) * 1000) / 10 : null;
            row.late_rate_pct = pct(row.late_returns, row.loans);
        });

        // The share of loans by item category and by membership type.
        const [byType] = await db.query(
            `SELECT ci.Item_type AS label, COUNT(*) AS loans
             ${LOAN_JOINS} ${f.where}
             GROUP BY ci.Item_type ORDER BY loans DESC`, f.values);
        const [byMember] = await db.query(
            `SELECT mt.Type_name AS label, COUNT(*) AS loans, COUNT(DISTINCT l.Member_id) AS borrowers
             ${LOAN_JOINS} ${f.where}
             GROUP BY mt.Type_name ORDER BY loans DESC`, f.values);

        // Totals for the tiles at the top.
        const [[totals]] = await db.query(
            `SELECT COUNT(*) AS loans, COUNT(DISTINCT l.Member_id) AS borrowers,
                    AVG(DATEDIFF(l.Return_date, DATE(l.Checkout_date))) AS avg_days_kept
             ${LOAN_JOINS} ${f.where}`, f.values);
        const totalLoans = Number(totals.loans);
        const busiest = filled.reduce((best, r) => (!best || r.loans > best.loans ? r : best), null);
        const last = filled.length ? filled[filled.length - 1] : null;

        const shares = rows => rows.map(r => ({ ...r, loans: Number(r.loans), share_pct: pct(Number(r.loans), totalLoans) }));
        res.json({
            filters,
            summary: {
                total_loans: totalLoans,
                borrowers: Number(totals.borrowers),
                loans_per_borrower: Number(totals.borrowers) ? round2(totalLoans / Number(totals.borrowers)) : null,
                avg_days_kept: round2(totals.avg_days_kept),          // only counts items already returned
                busiest_month: busiest ? busiest.month : null,
                busiest_month_loans: busiest ? busiest.loans : null,
                latest_month: last ? last.month : null,
                latest_month_change_pct: last ? last.change_pct : null,
                // true when the latest month is the month we are in now, so its numbers are not final yet
                latest_month_partial: last ? last.month === new Date().toISOString().slice(0, 7) : false
            },
            tables: { months: filled, byType: shares(byType), byMemberType: shares(byMember) },
            chart: { labels: filled.map(r => r.month), values: filled.map(r => r.loans) }
        });
    } catch (error) { sendError(res, error); }
});

// ---------------------------------------------------------------------
// GET /api/reports/collection  -  Collection use
// Question: which parts of the collection are used, and which sit idle?
// For each item category: how many titles and copies we own, how many loans they got, loans per copy,
// and how much of the circulating stock is out right now. Then the titles used most per copy and the
// titles nobody borrowed in the period. (Member type does not apply here: it is about the collection.)
// ---------------------------------------------------------------------
router.get('/collection', async (req, res) => {
    try {
        const filters = readFilters(req.query);
        const dates = dateConditions('l.Checkout_date', filters);

        // What we own right now, by category. "Circulating" copies are the ones that can still be lent
        // (not withdrawn, not lost). Deleted items and copies are not counted.
        const typeWhere = filters.type ? 'AND ci.Item_type = ?' : '';
        const typeValues = filters.type ? [filters.type] : [];
        const [stock] = await db.query(
            `SELECT ci.Item_type AS label,
                    COUNT(DISTINCT ci.Item_id) AS titles,
                    COUNT(c.Copy_id) AS copies,
                    SUM(c.Status NOT IN ('withdrawn','lost')) AS circulating,
                    SUM(c.Status = 'on loan') AS on_loan_now
               FROM CatalogItem ci
               LEFT JOIN Copy c ON c.Item_id = ci.Item_id AND c.Is_deleted = FALSE
              WHERE ci.Is_deleted = FALSE ${typeWhere}
              GROUP BY ci.Item_type`, typeValues);

        // Loans in the period, by category.
        const loanWhere = ['1 = 1', ...dates.sql, ...(filters.type ? ['ci.Item_type = ?'] : [])].join(' AND ');
        const [loanRows] = await db.query(
            `SELECT ci.Item_type AS label, COUNT(*) AS loans
               FROM Loan l JOIN Copy c ON c.Copy_id = l.Copy_id JOIN CatalogItem ci ON ci.Item_id = c.Item_id
              WHERE ${loanWhere}
              GROUP BY ci.Item_type`, [...dates.values, ...typeValues]);
        const loansByType = new Map(loanRows.map(r => [r.label, Number(r.loans)]));

        const byType = stock.map(r => {
            const circulating = Number(r.circulating || 0), loans = loansByType.get(r.label) || 0;
            return {
                label: r.label, titles: Number(r.titles), copies: Number(r.copies || 0), circulating,
                loans,
                loans_per_copy: circulating ? round2(loans / circulating) : null,
                on_loan_now: Number(r.on_loan_now || 0),
                in_use_pct: pct(Number(r.on_loan_now || 0), circulating)
            };
        }).sort((a, b) => (b.loans_per_copy ?? -1) - (a.loans_per_copy ?? -1));

        // Every title with its circulating copies and its loans in the period. The date and category
        // conditions for the loans go in the JOIN (so titles with no loans still appear, with 0).
        const joinDates = dates.sql.length ? 'AND ' + dates.sql.join(' AND ') : '';
        const [titles] = await db.query(
            `SELECT ci.Item_id, ci.Title, ci.Item_type,
                    (SELECT COUNT(*) FROM Copy c2
                      WHERE c2.Item_id = ci.Item_id AND c2.Is_deleted = FALSE
                        AND c2.Status NOT IN ('withdrawn','lost')) AS copies,
                    COUNT(l.Loan_id) AS loans
               FROM CatalogItem ci
               LEFT JOIN Copy c ON c.Item_id = ci.Item_id
               LEFT JOIN Loan l ON l.Copy_id = c.Copy_id ${joinDates}
              WHERE ci.Is_deleted = FALSE ${typeWhere}
              GROUP BY ci.Item_id, ci.Title, ci.Item_type`, [...dates.values, ...typeValues]);
        const rated = titles.map(t => ({
            item_id: t.Item_id, title: t.Title, item_type: t.Item_type,
            copies: Number(t.copies), loans: Number(t.loans),
            loans_per_copy: Number(t.copies) ? round2(Number(t.loans) / Number(t.copies)) : null
        }));
        const mostUsed = rated.filter(t => t.loans > 0)
            .sort((a, b) => (b.loans_per_copy ?? 0) - (a.loans_per_copy ?? 0) || b.loans - a.loans).slice(0, 10);
        const idle = rated.filter(t => t.loans === 0 && t.copies > 0)
            .sort((a, b) => b.copies - a.copies || a.title.localeCompare(b.title)).slice(0, 15);

        const totalCirculating = byType.reduce((n, r) => n + r.circulating, 0);
        const totalLoans = byType.reduce((n, r) => n + r.loans, 0);
        const titlesOwned = rated.length;
        res.json({
            filters,
            summary: {
                titles: titlesOwned,
                circulating_copies: totalCirculating,
                loans: totalLoans,
                loans_per_copy: totalCirculating ? round2(totalLoans / totalCirculating) : null,
                in_use_now_pct: pct(byType.reduce((n, r) => n + r.on_loan_now, 0), totalCirculating),
                idle_titles: rated.filter(t => t.loans === 0 && t.copies > 0).length,
                idle_titles_pct: pct(rated.filter(t => t.loans === 0 && t.copies > 0).length, titlesOwned)
            },
            tables: { byType, mostUsed, idle },
            chart: { labels: byType.map(r => r.label), values: byType.map(r => r.loans_per_copy) }
        });
    } catch (error) { sendError(res, error); }
});

// ---------------------------------------------------------------------
// GET /api/reports/late-fines  -  Late returns and fines
// Question: how big is the overdue problem, who and what does it come from, and do we collect the fines?
// Replaces the two old lists (overdue loans, unpaid fines) with rates and comparisons:
// how many returns were late, by how much, per category and membership type, how much was fined,
// collected, still owed or waived, and which members repeat the problem.
// ---------------------------------------------------------------------
router.get('/late-fines', async (req, res) => {
    try {
        const filters = readFilters(req.query);
        const f = loanFilter(filters, true);

        // Late-return statistics for one grouping. column is a fixed text from the list below,
        // never something typed by the user.
        async function lateBy(column) {
            const [rows] = await db.query(
                `SELECT ${column} AS label,
                        COUNT(*) AS loans,
                        SUM(l.Return_date IS NOT NULL) AS returned,
                        SUM(l.Return_date IS NOT NULL AND l.Return_date > l.Due_date) AS late,
                        AVG(CASE WHEN l.Return_date > l.Due_date THEN DATEDIFF(l.Return_date, l.Due_date) END) AS avg_days_late,
                        SUM(l.Return_date IS NULL AND l.Due_date < CURDATE()) AS overdue_now
                 ${LOAN_JOINS} ${f.where}
                 GROUP BY ${column} ORDER BY late DESC, label`, f.values);
            return rows.map(r => ({
                label: r.label, loans: Number(r.loans), returned: Number(r.returned), late: Number(r.late),
                late_rate_pct: pct(Number(r.late), Number(r.returned)),     // late returns out of items that came back
                avg_days_late: round2(r.avg_days_late),
                overdue_now: Number(r.overdue_now)
            }));
        }
        const lateByType = await lateBy('ci.Item_type');
        const lateByMember = await lateBy('mt.Type_name');

        // Fines for the same group of loans. Amount = 0 with Is_paid set means the fine was waived
        // (see routes/fines.js), so waived fines are counted but have no amount left.
        async function finesBy(column) {
            const [rows] = await db.query(
                `SELECT ${column} AS label,
                        COUNT(*) AS fines,
                        SUM(IF(f.Amount > 0, f.Amount, 0)) AS assessed,
                        SUM(IF(f.Is_paid = TRUE AND f.Amount > 0, f.Amount, 0)) AS collected,
                        SUM(IF(f.Is_paid = FALSE, f.Amount, 0)) AS unpaid,
                        SUM(f.Is_paid = TRUE AND f.Amount = 0) AS waived
                   FROM Fine f
                   JOIN Loan l         ON l.Loan_id = f.Loan_id
                   JOIN Copy c         ON c.Copy_id = l.Copy_id
                   JOIN CatalogItem ci ON ci.Item_id = c.Item_id
                   JOIN Member m       ON m.Member_id = l.Member_id
                   JOIN MemberType mt  ON mt.Member_type_id = m.Member_type_id
                  ${f.where}
                  GROUP BY ${column}`, f.values);
            return rows.map(r => ({
                label: r.label, fines: Number(r.fines), assessed: round2(r.assessed), collected: round2(r.collected),
                unpaid: round2(r.unpaid), waived: Number(r.waived),
                collection_rate_pct: pct(Number(r.collected), Number(r.collected) + Number(r.unpaid))
            }));
        }
        const finesByType = await finesBy('ci.Item_type');
        const finesByMember = await finesBy('mt.Type_name');
        const sum = (rows, key) => rows.reduce((n, r) => n + Number(r[key] || 0), 0);

        // Members who repeat the problem: late returns plus items still overdue, and what they owe now.
        const [repeat] = await db.query(
            `SELECT m.Username AS username, CONCAT(m.First_name, ' ', m.Last_name) AS name, mt.Type_name AS member_type,
                    SUM(l.Return_date IS NOT NULL AND l.Return_date > l.Due_date) AS late_returns,
                    SUM(l.Return_date IS NULL AND l.Due_date < CURDATE()) AS overdue_now,
                    (SELECT COALESCE(SUM(f2.Amount), 0) FROM Fine f2 JOIN Loan l2 ON l2.Loan_id = f2.Loan_id
                      WHERE l2.Member_id = m.Member_id AND f2.Is_paid = FALSE) AS owes
             ${LOAN_JOINS} ${f.where}
             GROUP BY m.Member_id, m.Username, m.First_name, m.Last_name, mt.Type_name
             HAVING late_returns + overdue_now > 0
             ORDER BY late_returns + overdue_now DESC, owes DESC, username
             LIMIT 10`, f.values);

        const total = lateByType.reduce((a, r) => ({ returned: a.returned + r.returned, late: a.late + r.late,
                                                      overdue_now: a.overdue_now + r.overdue_now }),
                                         { returned: 0, late: 0, overdue_now: 0 });
        const collected = sum(finesByType, 'collected'), unpaid = sum(finesByType, 'unpaid');
        const [[days]] = await db.query(
            `SELECT AVG(CASE WHEN l.Return_date > l.Due_date THEN DATEDIFF(l.Return_date, l.Due_date) END) AS avg_days_late
             ${LOAN_JOINS} ${f.where}`, f.values);
        res.json({
            filters,
            summary: {
                returned: total.returned, late_returns: total.late,
                late_rate_pct: pct(total.late, total.returned),
                avg_days_late: round2(days.avg_days_late),
                overdue_now: total.overdue_now,
                fines_assessed: round2(sum(finesByType, 'assessed')),
                fines_collected: round2(collected),
                fines_unpaid: round2(unpaid),
                fines_waived: sum(finesByType, 'waived'),
                collection_rate_pct: pct(collected, collected + unpaid)
            },
            tables: { lateByType, lateByMemberType: lateByMember, finesByType, finesByMemberType: finesByMember,
                      repeatMembers: repeat.map(r => ({ ...r, late_returns: Number(r.late_returns),
                                                        overdue_now: Number(r.overdue_now), owes: round2(r.owes) })) },
            chart: { labels: lateByType.map(r => r.label), values: lateByType.map(r => r.late_rate_pct) }
        });
    } catch (error) { sendError(res, error); }
});

// ---------------------------------------------------------------------
// GET /api/reports/demand  -  Demand versus supply
// Question: which titles do members wait for, and where should the library buy more copies?
// Holds are what members do when no copy is free. For each title with holds: copies owned, holds waiting,
// holds per copy and a suggested action. Also how holds ended (picked up, expired, cancelled).
// From / To cut on the day the hold was placed. (Member type does not apply here.)
// ---------------------------------------------------------------------
router.get('/demand', async (req, res) => {
    try {
        const filters = readFilters(req.query);
        const holdDates = dateConditions('h.Hold_date', filters);
        const loanDates = dateConditions('l.Checkout_date', filters);
        const typeWhere = filters.type ? 'AND ci.Item_type = ?' : '';
        const typeValues = filters.type ? [filters.type] : [];

        // How holds ended in the period. Active and Ready holds are still open.
        const [outcomeRows] = await db.query(
            `SELECT h.Status AS label, COUNT(*) AS holds
               FROM Hold h JOIN CatalogItem ci ON ci.Item_id = h.Item_id
              WHERE 1 = 1 ${holdDates.sql.length ? 'AND ' + holdDates.sql.join(' AND ') : ''} ${typeWhere}
              GROUP BY h.Status`, [...holdDates.values, ...typeValues]);
        const outcomes = ['Active', 'Ready', 'Completed', 'Expired', 'Cancelled']
            .map(status => ({ label: status, holds: Number((outcomeRows.find(r => r.label === status) || {}).holds || 0) }));
        const count = status => outcomes.find(o => o.label === status).holds;
        const finished = count('Completed') + count('Expired') + count('Cancelled');

        // One row per title that has holds in the period or open holds now.
        // The inner SELECT works out the four numbers for every title; the outer one keeps only
        // titles that had holds (the numbers are named columns, so the outer WHERE can use them).
        const [items] = await db.query(
            `SELECT * FROM (
               SELECT ci.Item_id, ci.Title, ci.Item_type,
                      (SELECT COUNT(*) FROM Copy c WHERE c.Item_id = ci.Item_id AND c.Is_deleted = FALSE
                          AND c.Status NOT IN ('withdrawn','lost')) AS copies,
                      (SELECT COUNT(*) FROM Hold h WHERE h.Item_id = ci.Item_id
                          AND h.Status IN ('Active','Ready')) AS open_holds,
                      (SELECT COUNT(*) FROM Hold h WHERE h.Item_id = ci.Item_id
                          ${holdDates.sql.length ? 'AND ' + holdDates.sql.join(' AND ') : ''}) AS holds_in_period,
                      (SELECT COUNT(*) FROM Loan l JOIN Copy c ON c.Copy_id = l.Copy_id WHERE c.Item_id = ci.Item_id
                          ${loanDates.sql.length ? 'AND ' + loanDates.sql.join(' AND ') : ''}) AS loans_in_period
                 FROM CatalogItem ci
                WHERE ci.Is_deleted = FALSE ${typeWhere}
             ) AS t
             WHERE t.open_holds > 0 OR t.holds_in_period > 0`,
            [...holdDates.values, ...loanDates.values, ...typeValues]);
        const rows = items.map(r => {
            const copies = Number(r.copies), open = Number(r.open_holds);
            const perCopy = copies ? round2(open / copies) : null;
            // A simple rule a manager can read: more people waiting than copies = buy another copy.
            let action = 'No action';
            if (copies === 0) action = 'No copy in circulation';
            else if (open > copies) action = 'Buy another copy';
            else if (open > 0) action = 'Watch';
            return { item_id: r.Item_id, title: r.Title, item_type: r.Item_type, copies, open_holds: open,
                     holds_in_period: Number(r.holds_in_period), loans_in_period: Number(r.loans_in_period),
                     holds_per_copy: perCopy, action };
        }).sort((a, b) => (b.holds_per_copy ?? 99) - (a.holds_per_copy ?? 99) || b.holds_in_period - a.holds_in_period);

        const totalHolds = outcomes.reduce((n, o) => n + o.holds, 0);
        res.json({
            filters,
            summary: {
                holds: totalHolds,
                open_holds: count('Active') + count('Ready'),
                pickup_rate_pct: pct(count('Completed'), finished),       // of holds that ended, how many ended in a pickup
                expired_or_cancelled_pct: pct(count('Expired') + count('Cancelled'), finished),
                titles_to_buy_more: rows.filter(r => r.action === 'Buy another copy').length
            },
            tables: { outcomes, items: rows },
            chart: { labels: rows.slice(0, 10).map(r => r.title), values: rows.slice(0, 10).map(r => r.holds_per_copy) }
        });
    } catch (error) { sendError(res, error); }
});

// Hand the router to app.js, which mounts it at /api/reports.
module.exports = router;
