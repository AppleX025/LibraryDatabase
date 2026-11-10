// =====================================================================
// public/reports/reports.js
// The shared script for the four management report pages
// (trends.html, collection.html, late-fines.html, demand.html).
//
// Each page only describes WHAT it shows (its tiles and tables) by calling
//     initReport({ ... })
// and this file does the rest: it draws the filter bar, asks the server for the
// numbers (GET /api/reports/<name>, see routes/reports.js), and fills in the tiles
// and tables. All text goes in with textContent, so a title or name with "<" or "&"
// can never be read as page code.
//
// FOR THE CHARTS: after every load this file saves the chart series in
//     window.reportData   (the whole answer from the server)
// and announces it with a "report-loaded" event on the document:
//     document.addEventListener('report-loaded', (event) => {
//         const { labels, values } = event.detail.chart;   // e.g. months and loans
//         ... draw the chart in <div id="chartArea"> ...
//     });
// Nothing here draws a chart, so that part is free for whoever builds it.
// =====================================================================

// ---------- Small formatting helpers ----------

// Every number goes through one of these, so a missing value (null) always shows as a dash.
const fmt = {
  // 12 -> "12", null -> "—"
  num: (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US')),
  // 36.4 -> "36.4%"
  pct: (v) => (v === null || v === undefined ? '—' : v + '%'),
  // 35.74 -> "$35.74"
  money: (v) => (v === null || v === undefined ? '—' : '$' + Number(v).toFixed(2)),
  // 0.57 -> "0.57"
  dec: (v) => (v === null || v === undefined ? '—' : String(v)),
  // 50 -> "+50%", -66.7 -> "-66.7%" (a change from one period to the next)
  change: (v) => (v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v + '%'),
  // plain text, with a dash for nothing
  text: (v) => (v === null || v === undefined || v === '' ? '—' : String(v))
};

// el(tag, text, className): makes one element with plain text inside.
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// The value of the explicit "All ..." choice in a drop-down. It means "no filter on this" and is
// left out of the address, so the server sees the same thing as before.
const ALL = 'all';

// ---------- The filter bar ----------

// buildFilters(config, options): draws the From / To / Item category / Member type fields
// and the Apply and Clear buttons into <form id="filters">.
// Returns the form, so the caller can listen for its submit.
function buildFilters(config, options) {
  const form = document.getElementById('filters');
  form.replaceChildren();

  // field(labelText, control): wraps one label and its control in a <div>.
  function field(labelText, control) {
    const wrap = el('div', null, 'field');
    const label = el('label', labelText);
    label.htmlFor = control.id;
    wrap.append(label, control);
    return wrap;
  }
  // choice(id, firstText, values): a drop-down that STARTS on "Choose ..." (an empty value), so the
  // person has to pick on purpose before a report can be shown. "All ..." is one of the choices,
  // not the starting point. required makes the browser refuse the form until something is picked.
  function choice(id, chooseText, allText, values) {
    const select = document.createElement('select');
    select.id = id;
    select.name = id;
    select.required = true;
    select.append(new Option(chooseText, ''));
    select.append(new Option(allText, ALL));
    for (const v of values) select.append(new Option(v, v));
    return select;
  }
  function dateInput(id) {
    const input = document.createElement('input');
    input.type = 'date';
    input.required = true;   // no default dates: the person picks the period
    input.id = id;
    input.name = id;
    return input;
  }

  form.append(field(config.fromLabel || 'From', dateInput('from')));
  form.append(field(config.toLabel || 'To', dateInput('to')));
  form.append(field('Item category', choice('type', 'Choose a category...', 'All categories', options.itemTypes)));
  if (config.showMemberType) {
    form.append(field('Membership type', choice('memberType', 'Choose a membership type...', 'All membership types', options.memberTypes)));
  }

  const apply = el('button', 'Show report');
  apply.type = 'submit';
  const clear = el('button', 'Clear', 'secondary');
  clear.type = 'button';
  // Clear empties every field and hides the report again: nothing is shown until the filters are chosen.
  clear.addEventListener('click', () => { form.reset(); form.dispatchEvent(new Event('filters-cleared')); });
  const buttons = el('div', null, 'field buttons');
  buttons.append(apply, clear);
  form.append(buttons);
  return form;
}

// queryString(form): the filters as an address part, e.g. "?from=2026-10-01&type=book".
// Empty fields are left out. URLSearchParams takes care of special characters.
function queryString(form) {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (value && value !== ALL) params.set(key, value);   // empty and "All" both mean no filter
  }
  const text = params.toString();
  return text ? '?' + text : '';
}

// ---------- Tiles and tables ----------

// drawTiles(tiles, summary): one box per number at the top of the report.
//   tile = { label, value: (summary) => '12', hint: (summary) => 'short note' (optional) }
function drawTiles(tiles, summary) {
  const box = document.getElementById('tiles');
  box.replaceChildren();
  for (const tile of tiles) {
    const item = el('div', null, 'tile');
    item.append(el('span', tile.label, 'tile-label'));
    item.append(el('strong', tile.value(summary), 'tile-value'));
    const hint = tile.hint ? tile.hint(summary) : '';
    if (hint) item.append(el('span', hint, 'tile-hint'));
    box.append(item);
  }
}

// drawTables(tables, data): one card per table.
//   table = { title, note (optional), rows: (data) => [...], empty: 'text when there are no rows',
//             columns: [{ head, value: (row) => '...', num: true (right-aligned) }] }
function drawTables(tables, data) {
  const area = document.getElementById('tables');
  area.replaceChildren();
  for (const table of tables) {
    const card = el('section', null, 'panel');
    card.append(el('h2', table.title));
    const note = typeof table.note === 'function' ? table.note(data) : table.note;   // a note can depend on the data
    if (note) card.append(el('p', note, 'muted'));

    const rows = table.rows(data);
    if (rows.length === 0) {
      card.append(el('p', table.empty || 'Nothing to show for these filters.', 'muted'));
      area.append(card);
      continue;
    }
    const scroll = el('div', null, 'table-scroll');
    const grid = document.createElement('table');
    const head = document.createElement('tr');
    for (const col of table.columns) head.append(el('th', col.head, col.num ? 'num' : ''));
    const thead = document.createElement('thead');
    thead.append(head);
    const tbody = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      for (const col of table.columns) tr.append(el('td', col.value(row), col.num ? 'num' : ''));
      tbody.append(tr);
    }
    grid.append(thead, tbody);
    scroll.append(grid);
    card.append(scroll);
    area.append(card);
  }
}

// ---------- The records behind the numbers ----------

// Every report also receives the actual rows its numbers are counted from (data.records, built by
// routes/reports.js). A page adds one of these tables at the end of its list, for example
//     ...  records.loans((d) => d.records)
// pick(d) says where in the answer the rows are, because the late-fines page has two sets.
// The server sends only the newest rows, with the full count next to them (see recordNote).
function recordNote(block) {
  const shown = block.rows.length;
  return shown < block.total
    ? 'The actual records these numbers come from. Showing the newest ' + fmt.num(shown) + ' of ' + fmt.num(block.total) + '.'
    : 'The actual records these numbers come from (' + fmt.num(block.total) + ' in all).';
}
const records = {
  // Loans: the rows behind the borrowing, late-return and use numbers.
  loans: (pick) => ({
    title: 'Records behind these numbers: loans',
    note: (d) => recordNote(pick(d)),
    rows: (d) => pick(d).rows,
    empty: 'No loans match these filters.',
    columns: [
      { head: 'Loan', value: (r) => r.loan_id, num: true },
      { head: 'Title', value: (r) => r.title },
      { head: 'Category', value: (r) => r.item_type },
      { head: 'Member', value: (r) => r.username },
      { head: 'Membership', value: (r) => r.member_type },
      { head: 'Checked out', value: (r) => r.checkout_date },
      { head: 'Due', value: (r) => r.due_date },
      { head: 'Returned', value: (r) => fmt.text(r.return_date) },
      { head: 'Status', value: (r) => r.state }
    ]
  }),
  // Fines: the rows behind the fine numbers.
  fines: (pick) => ({
    title: 'Records behind these numbers: fines',
    note: (d) => recordNote(pick(d)),
    rows: (d) => pick(d).rows,
    empty: 'No fines match these filters.',
    columns: [
      { head: 'Fine', value: (r) => r.fine_id, num: true },
      { head: 'Loan', value: (r) => r.loan_id, num: true },
      { head: 'Title', value: (r) => r.title },
      { head: 'Member', value: (r) => r.username },
      { head: 'Membership', value: (r) => r.member_type },
      { head: 'Type', value: (r) => r.fine_type },
      { head: 'Amount', value: (r) => fmt.money(r.amount), num: true },
      { head: 'Assessed', value: (r) => r.date_assessed },
      { head: 'Status', value: (r) => r.state }
    ]
  }),
  // Holds: the rows behind the demand numbers.
  holds: (pick) => ({
    title: 'Records behind these numbers: holds',
    note: (d) => recordNote(pick(d)),
    rows: (d) => pick(d).rows,
    empty: 'No holds match these filters.',
    columns: [
      { head: 'Hold', value: (r) => r.hold_id, num: true },
      { head: 'Title', value: (r) => r.title },
      { head: 'Category', value: (r) => r.item_type },
      { head: 'Member', value: (r) => r.username },
      { head: 'Placed', value: (r) => r.hold_date },
      { head: 'Status', value: (r) => r.status }
    ]
  })
};

// ---------- The one function each page calls ----------

// initReport(config): starts a report page.
//   config = { endpoint: 'trends', showMemberType: true/false, fromLabel, toLabel, tiles: [...], tables: [...] }
async function initReport(config) {
  const status = document.getElementById('status');

  // Short messages in the line under the filters (errors, or "Loading...").
  function say(text, isError) {
    status.textContent = text;
    status.className = isError ? 'error' : 'muted';
  }

  // The choices for the drop-downs (item categories and membership types).
  let options;
  try {
    const response = await fetch('/api/reports/options');
    if (!response.ok) { say((await response.json()).message, true); return; }
    options = await response.json();
  } catch (err) {
    say('Could not reach the server. Please try again.', true);
    return;
  }
  const form = buildFilters(config, options);

  // The parts of the page that only make sense once a report has been asked for.
  const tilesBox = document.getElementById('tiles');
  const tablesBox = document.getElementById('tables');
  const chartBox = document.getElementById('chartArea');
  const footnote = document.getElementById('reportFootnote');   // an optional note under the tiles (Trends page)

  // hideReport(): empties and hides the numbers, the chart spot and the tables, and says what to do.
  function hideReport() {
    tilesBox.replaceChildren();
    tablesBox.replaceChildren();
    if (chartBox) chartBox.hidden = true;
    if (footnote) footnote.hidden = true;
    window.reportData = null;
    say('Choose the dates and the filters above, then press Show report. Nothing is shown until you do.', false);
  }

  // load(): asks the server for the report with the current filters and shows it.
  async function load() {
    say('Loading...', false);
    try {
      const response = await fetch('/api/reports/' + config.endpoint + queryString(form));
      const data = await response.json();
      if (!response.ok) { say(data.message, true); return; }   // for example a bad date range
      say('', false);
      if (chartBox) chartBox.hidden = false;
      if (footnote) footnote.hidden = false;
      drawTiles(config.tiles, data.summary);
      drawTables(config.tables, data);
      // Hand the numbers to anyone who wants to draw a chart (see the top of this file).
      window.reportData = data;
      document.dispatchEvent(new CustomEvent('report-loaded', { detail: data }));
    } catch (err) {
      say('Could not reach the server. Please try again.', true);
    }
  }

  // Pressing Show report loads the report. The browser has already refused the form if a date or a
  // drop-down was left empty (they are all "required"), so a report is never shown by default.
  form.addEventListener('submit', (event) => { event.preventDefault(); load(); });
  form.addEventListener('filters-cleared', hideReport);
  hideReport();   // the page opens with no report: the person chooses the filters first
}
