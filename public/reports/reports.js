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
  // choice(id, firstText, values): a drop-down with an "all" choice first.
  function choice(id, firstText, values) {
    const select = document.createElement('select');
    select.id = id;
    select.name = id;
    select.append(new Option(firstText, ''));
    for (const v of values) select.append(new Option(v, v));
    return select;
  }
  function dateInput(id) {
    const input = document.createElement('input');
    input.type = 'date';
    input.id = id;
    input.name = id;
    return input;
  }

  form.append(field(config.fromLabel || 'From', dateInput('from')));
  form.append(field(config.toLabel || 'To', dateInput('to')));
  form.append(field('Item category', choice('type', 'All categories', options.itemTypes)));
  if (config.showMemberType) {
    form.append(field('Membership type', choice('memberType', 'All membership types', options.memberTypes)));
  }

  const apply = el('button', 'Apply');
  apply.type = 'submit';
  const clear = el('button', 'Clear', 'secondary');
  clear.type = 'button';
  // Clear empties every field and loads the report again with no filters.
  clear.addEventListener('click', () => { form.reset(); form.requestSubmit(); });
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
    if (value) params.set(key, value);
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
    if (table.note) card.append(el('p', table.note, 'muted'));

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

  // load(): asks the server for the report with the current filters and shows it.
  async function load() {
    say('Loading...', false);
    try {
      const response = await fetch('/api/reports/' + config.endpoint + queryString(form));
      const data = await response.json();
      if (!response.ok) { say(data.message, true); return; }   // for example a bad date range
      say('', false);
      drawTiles(config.tiles, data.summary);
      drawTables(config.tables, data);
      // Hand the numbers to anyone who wants to draw a chart (see the top of this file).
      window.reportData = data;
      document.dispatchEvent(new CustomEvent('report-loaded', { detail: data }));
    } catch (err) {
      say('Could not reach the server. Please try again.', true);
    }
  }

  // Pressing Apply (or Enter in a field) loads the report with the new filters.
  form.addEventListener('submit', (event) => { event.preventDefault(); load(); });
  load();   // show the report as soon as the page opens
}
