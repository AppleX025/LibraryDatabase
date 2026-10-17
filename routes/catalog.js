// Checkpoint 3, Role B — staff-only catalog administration.
const router = require('express').Router();
const db = require('../config/db');
const { isStaff } = require('../middleware/auth');
router.use(isStaff);

const TYPES = {
  book: { table: 'Book', fields: ['Isbn', 'Genre'] },
  videogame: { table: 'Videogame', fields: ['Platform', 'Developer', 'Esrb_rating'] },
  boardgame: { table: 'BoardGame', fields: ['Min_players', 'Max_players', 'Designer'] },
  dvd: { table: 'DVD', fields: ['Runtime_minutes', 'Director', 'Mpaa_rating'] },
  music: { table: 'Music', fields: ['Artist', 'Track_count'] },
  newspaper: { table: 'Newspaper', fields: ['Newspaper_name', 'Issue_date', 'Edition', 'Is_historical'] },
  researchpaper: { table: 'ResearchPaper', fields: ['Doi', 'Journal_name', 'Volume', 'Issue', 'Page_range'] }
};
const numericFields = new Set(['Min_players','Max_players','Runtime_minutes','Track_count']);
const optionalText = value => value === undefined || value === null || String(value).trim() === '' ? null : String(value).trim();
const optionalNumber = value => optionalText(value) === null ? null : Number(value);
const positiveId = v => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
const bad = message => Object.assign(new Error(message), { status: 400 });

function validateItem(input) {
  const type = input.Item_type;
  if (!Object.hasOwn(TYPES, type)) throw bad('Select a valid item category.');
  const title = optionalText(input.Title);
  if (!title || title.length > 255) throw bad('Enter a title (up to 255 characters).');
  const replacement = Number(input.Replacement_cost);
  if (input.Replacement_cost === '' || input.Replacement_cost == null || !Number.isFinite(replacement) || replacement < 0 || replacement > 9999.99) {
    throw bad('Enter a replacement cost between $0 and $9,999.99.');
  }
  const year = optionalNumber(input.Publication_year);
  if (year !== null && (!Number.isInteger(year) || year < 1400 || year > 2100)) throw bad('Publication year must be between 1400 and 2100.');
  const publisher = optionalText(input.Publisher_id) === null ? null : positiveId(input.Publisher_id);
  if (optionalText(input.Publisher_id) !== null && !publisher) throw bad('Choose a valid publisher.');
  const extra = {};
  for (const field of TYPES[type].fields) {
    let value = optionalText(input[field]);
    if (numericFields.has(field)) {
      value = optionalNumber(input[field]);
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > 32767)) throw bad(`Invalid ${field}.`);
    }
    if (field === 'Is_historical') value = input.Is_historical === true || input.Is_historical === 1 || input.Is_historical === '1' ? 1 : 0;
    if (field === 'Edition') value = value || '';
    extra[field] = value;
  }
  if (type === 'book' && extra.Isbn && !/^(?:[0-9]{13}|[0-9]{9}[0-9Xx])$/.test(extra.Isbn)) throw bad('ISBN must be 13 digits or a valid 10-character format ending in a digit or X.');
  if (type === 'boardgame' && extra.Min_players != null && extra.Max_players != null && extra.Max_players < extra.Min_players) throw bad('Maximum players must be at least minimum players.');
  if (type === 'boardgame' && (extra.Min_players === 0 || extra.Max_players === 0)) throw bad('Player counts must be positive.');
  if (type === 'newspaper') {
    if (!extra.Newspaper_name || !/^\d{4}-\d{2}-\d{2}$/.test(extra.Issue_date || '')) throw bad('Newspapers need a name and issue date.');
    if (extra.Is_historical && (replacement < 150 || replacement > 425)) throw bad('Historical newspaper replacement cost must be $150–$425.');
  }
  if (type === 'researchpaper' && (replacement < 174 || replacement > 425)) throw bad('Research paper replacement cost must be $174–$425.');
  const authors = Array.isArray(input.Author_ids) ? input.Author_ids.map(positiveId) : [];
  if (authors.some(id => !id) || new Set(authors).size !== authors.length) throw bad('Choose valid, nonduplicate authors.');
  if (authors.length && !['book', 'researchpaper'].includes(type)) throw bad('Authors can be linked only to books or research papers.');
  return { type, title, replacement, year, publisher, extra, authors };
}

function handleError(res, err) {
  if (err.status) return res.status(err.status).json({ message: err.message });
  if (err.code === 'ER_DUP_ENTRY') {
    const message = /isbn/i.test(err.sqlMessage || '') ? 'That ISBN is already in use.' : /barcode/i.test(err.sqlMessage || '') ? 'That barcode is already in use.' : /publisher/i.test(err.sqlMessage || '') ? 'That publisher already exists.' : /newspaper/i.test(err.sqlMessage || '') ? 'That newspaper issue already exists.' : /doi/i.test(err.sqlMessage || '') ? 'That DOI is already in use.' : 'This record already exists.';
    return res.status(409).json({ message });
  }
  if (['ER_NO_REFERENCED_ROW_2','ER_ROW_IS_REFERENCED_2'].includes(err.code)) return res.status(400).json({ message: 'A referenced publisher, author, or item is missing or in use.' });
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || err.code === 'WARN_DATA_TRUNCATED') return res.status(400).json({ message: 'The item does not meet the database category or field rules. Check the values and item type.' });
  console.error('Catalog error:', err);
  return res.status(500).json({ message: 'Catalog operation failed. Please try again.' });
}

router.get('/items', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT ci.Item_id, ci.Item_type, ci.Title, ci.Publisher_id,
      p.Name AS Publisher_name, ci.Publication_year, ci.Replacement_cost,
      COUNT(c.Copy_id) AS Total_copies,
      SUM(CASE WHEN c.Status = 'available' THEN 1 ELSE 0 END) AS Available_copies,
      SUM(CASE WHEN c.Status = 'withdrawn' THEN 1 ELSE 0 END) AS Withdrawn_copies
      FROM CatalogItem ci LEFT JOIN Publisher p ON p.Publisher_id = ci.Publisher_id
      LEFT JOIN Copy c ON c.Item_id = ci.Item_id
      GROUP BY ci.Item_id, ci.Item_type, ci.Title, ci.Publisher_id, p.Name, ci.Publication_year, ci.Replacement_cost
      ORDER BY ci.Item_id DESC`);
    res.json(rows);
  } catch (err) { handleError(res, err); }
});
router.get('/publishers', async (req, res) => {
  try { const [rows] = await db.query('SELECT Publisher_id, Name FROM Publisher ORDER BY Name'); res.json(rows); }
  catch (err) { handleError(res, err); }
});
router.post('/publishers', async (req, res) => {
  try {
    const name = optionalText(req.body.Name);
    if (!name || name.length > 100) throw bad('Publisher name is required (maximum 100 characters).');
    const [r] = await db.execute('INSERT INTO Publisher (Name) VALUES (?)', [name]);
    res.status(201).json({ Publisher_id: r.insertId, Name: name });
  } catch (err) { handleError(res, err); }
});
router.get('/authors', async (req, res) => {
  try { const [rows] = await db.query('SELECT Author_id, First_name, Last_name FROM Author ORDER BY Last_name, First_name'); res.json(rows); }
  catch (err) { handleError(res, err); }
});
router.post('/authors', async (req, res) => {
  try {
    const first = optionalText(req.body.First_name), last = optionalText(req.body.Last_name);
    if (!first || !last || first.length > 50 || last.length > 50) throw bad('Enter an author first and last name (up to 50 characters each).');
    const [r] = await db.execute('INSERT INTO Author (First_name, Last_name) VALUES (?, ?)', [first, last]);
    res.status(201).json({ Author_id: r.insertId, First_name: first, Last_name: last });
  } catch (err) { handleError(res, err); }
});
router.get('/items/:id', async (req, res) => {
  try {
    const id = positiveId(req.params.id); if (!id) throw bad('Invalid item ID.');
    const [[item]] = await db.execute('SELECT * FROM CatalogItem WHERE Item_id = ?', [id]);
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    const spec = TYPES[item.Item_type];
    const [[extra]] = await db.query(`SELECT * FROM \`${spec.table}\` WHERE Item_id = ?`, [id]);
    const [copies] = await db.execute('SELECT Copy_id, Barcode, `Condition`, Shelf_location, Status, Date_acquired FROM Copy WHERE Item_id = ? ORDER BY Copy_id', [id]);
    let authors = [];
    if (item.Item_type === 'book' || item.Item_type === 'researchpaper') {
      const junction = item.Item_type === 'book' ? 'BookAuthor' : 'PaperAuthor';
      [authors] = await db.query(`SELECT Author_id FROM \`${junction}\` WHERE Item_id = ?`, [id]);
    }
    res.json({ ...item, ...extra, Author_ids: authors.map(a => a.Author_id), copies });
  } catch (err) { handleError(res, err); }
});
async function syncAuthors(conn, itemId, type, authors) {
  if (!['book','researchpaper'].includes(type)) return;
  const table = type === 'book' ? 'BookAuthor' : 'PaperAuthor';
  await conn.query(`DELETE FROM \`${table}\` WHERE Item_id = ?`, [itemId]);
  for (const authorId of authors) await conn.query(`INSERT INTO \`${table}\` (Item_id, Author_id) VALUES (?, ?)`, [itemId, authorId]);
}
router.post('/items', async (req, res) => {
  let conn;
  try {
    const x = validateItem(req.body);
    conn = await db.getConnection(); await conn.beginTransaction();
    const [r] = await conn.execute('INSERT INTO CatalogItem (Item_type, Title, Publisher_id, Publication_year, Replacement_cost) VALUES (?, ?, ?, ?, ?)', [x.type, x.title, x.publisher, x.year, x.replacement]);
    const id = r.insertId, fields = TYPES[x.type].fields;
    await conn.query(`INSERT INTO \`${TYPES[x.type].table}\` (Item_id, Item_type, ${fields.map(f=>`\`${f}\``).join(', ')}) VALUES (${Array(fields.length+2).fill('?').join(', ')})`, [id, x.type, ...fields.map(f=>x.extra[f])]);
    await syncAuthors(conn, id, x.type, x.authors);
    await conn.commit(); res.status(201).json({ Item_id: id, message: 'Catalog item created.' });
  } catch (err) { if (conn) await conn.rollback(); handleError(res, err); }
  finally { if (conn) conn.release(); }
});
router.put('/items/:id', async (req, res) => {
  let conn;
  try {
    const id = positiveId(req.params.id); if (!id) throw bad('Invalid item ID.');
    const x = validateItem(req.body);
    conn = await db.getConnection(); await conn.beginTransaction();
    const [[old]] = await conn.execute('SELECT Item_type FROM CatalogItem WHERE Item_id = ? FOR UPDATE', [id]);
    if (!old) { await conn.rollback(); return res.status(404).json({ message: 'Item not found.' }); }
    if (old.Item_type !== x.type) throw bad('Item category cannot be changed after creation. Create a new item instead.');
    await conn.execute('UPDATE CatalogItem SET Title=?, Publisher_id=?, Publication_year=?, Replacement_cost=? WHERE Item_id=?', [x.title,x.publisher,x.year,x.replacement,id]);
    const fields = TYPES[x.type].fields;
    await conn.query(`UPDATE \`${TYPES[x.type].table}\` SET ${fields.map(f=>`\`${f}\` = ?`).join(', ')} WHERE Item_id = ?`, [...fields.map(f=>x.extra[f]), id]);
    await syncAuthors(conn, id, x.type, x.authors);
    await conn.commit(); res.json({ message: 'Catalog item updated.' });
  } catch (err) { if (conn) await conn.rollback(); handleError(res, err); }
  finally { if (conn) conn.release(); }
});
router.post('/items/:id/copies', async (req, res) => {
  try {
    const id = positiveId(req.params.id); if (!id) throw bad('Invalid item ID.');
    const barcode = optionalText(req.body.Barcode), condition = req.body.Condition;
    const shelf = optionalText(req.body.Shelf_location);
    if (!barcode || barcode.length > 20) throw bad('Barcode is required (maximum 20 characters).');
    if (!['new','good','worn','damaged'].includes(condition)) throw bad('Select a valid copy condition.');
    if (shelf && shelf.length > 30) throw bad('Shelf location is too long.');
    const date = req.body.Date_acquired || new Date().toISOString().slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('Use YYYY-MM-DD for the acquisition date.');
    const [r] = await db.execute('INSERT INTO Copy (Item_id, Barcode, `Condition`, Shelf_location, Date_acquired) VALUES (?, ?, ?, ?, ?)', [id,barcode,condition,shelf,date]);
    res.status(201).json({ Copy_id: r.insertId, message: 'Copy added.' });
  } catch (err) { handleError(res, err); }
});
router.patch('/copies/:id/withdraw', async (req, res) => {
  let conn;
  try {
    const id = positiveId(req.params.id); if (!id) throw bad('Invalid copy ID.');
    conn = await db.getConnection(); await conn.beginTransaction();
    const [[copy]] = await conn.execute('SELECT Status FROM Copy WHERE Copy_id = ? FOR UPDATE', [id]);
    if (!copy) { await conn.rollback(); return res.status(404).json({ message: 'Copy not found.' }); }
    if (copy.Status !== 'available') throw bad('Only available copies can be withdrawn. Return or resolve outstanding loans first.');
    const [[openLoan]] = await conn.execute('SELECT Loan_id FROM Loan WHERE Copy_id = ? AND Return_date IS NULL LIMIT 1', [id]);
    if (openLoan) throw bad('Cannot withdraw a copy with an open loan.');
    const [[hold]] = await conn.execute("SELECT Hold_id FROM Hold WHERE Reserved_copy_id = ? AND Status = 'Ready' LIMIT 1", [id]);
    if (hold) throw bad('Cannot withdraw a copy reserved for a ready hold.');
    await conn.execute("UPDATE Copy SET Status = 'withdrawn' WHERE Copy_id = ?", [id]);
    await conn.commit(); res.json({ message: 'Copy withdrawn. Its history was preserved.' });
  } catch (err) { if (conn) await conn.rollback(); handleError(res, err); }
  finally { if (conn) conn.release(); }
});
module.exports = router;
