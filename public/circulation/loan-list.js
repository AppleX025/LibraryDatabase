// =====================================================================
// public/circulation/loan-list.js
// The list of "loans out right now" shown on the Renew and Return pages.
//
// Why it exists: the library has no barcode scanners, so staff should not have to
// look up a Copy ID somewhere else and type it in. This list shows every open loan
// with a button on each row, so staff just find the row and press the button.
//
// Each page calls it once, with a small description of what its button does:
//     initLoanList({
//       endpoint:    '/api/circulation/renew',   // where the button sends the copy ID
//       buttonLabel: 'Renew',
//       showRenewals: true,                       // show the "Renewals" column
//       canAct:      (loan) => null or 'a reason the button is switched off',
//       conditionChoice: true,                    // Return page only: OK / Damaged / Lost drop-down
//       notify:      (message, isError) => ...    // the page's green/red notice box
//     });
// The page gets back  { reload }  so the Copy ID form can refresh the list after it
// has renewed or returned something by hand.
//
// The list itself comes from GET /api/circulation/open-loans (staff, no member given =
// every open loan, oldest due date first, so the most overdue loans are at the top).
// All text goes in with textContent, so a title or name with "<" or "&" can never be
// read as page code.
// =====================================================================

// el(tag, text, className): makes one element with plain text inside.
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// initLoanList(config): draws the filter box and the table into <div id="loanList">
// and keeps them up to date. See the top of this file for what config holds.
function initLoanList(config) {
  const box = document.getElementById('loanList');

  // The filter box, the status line and the table are made once and filled again on every reload.
  const filter = document.createElement('input');
  filter.type = 'search';
  filter.id = 'loanFilter';
  filter.placeholder = 'Filter by title, member or copy ID';
  filter.setAttribute('aria-label', 'Filter the loans');
  const status = el('p', '', 'muted');
  const scroll = el('div', null, 'table-scroll');
  box.replaceChildren(filter, status, scroll);

  let loans = [];   // every open loan, as the server last sent them

  // ---------- Loading ----------

  // reload(): asks the server for the open loans and draws them.
  // After a button press the note (green or red) is put on the row it belongs to.
  async function reload(noteForCopy, noteText, noteIsError) {
    try {
      const response = await fetch('/api/circulation/open-loans');
      const data = await response.json();
      if (!response.ok) { status.textContent = data.message || 'Could not load the loans.'; scroll.replaceChildren(); return; }
      loans = data.loans;
    } catch (err) {
      status.textContent = 'Could not reach the server. Please try again.';
      return;
    }
    draw();
    // Put the answer on the row that was used (it is gone after a return, and then the
    // page's notice box shows the answer instead).
    if (noteForCopy) {
      const row = scroll.querySelector('tr[data-copy-id="' + noteForCopy + '"]');
      if (row) addNote(row.lastElementChild, noteText, noteIsError);
      else config.notify(noteText, noteIsError);
    }
  }

  // ---------- Drawing ----------

  // draw(): fills the table with the loans that match the filter box.
  function draw() {
    const words = filter.value.trim().toLowerCase();
    // A loan matches when the typed words appear in its title, member name, username or copy ID.
    const shown = loans.filter((loan) => {
      if (!words) return true;
      return [loan.title, loan.member_name, loan.member_username, String(loan.copy_id)]
        .some((text) => String(text).toLowerCase().includes(words));
    });

    status.textContent = loans.length === 0
      ? 'No loans are out right now.'
      : shown.length + ' of ' + loans.length + ' loans out right now.';
    if (shown.length === 0) { scroll.replaceChildren(); return; }

    const table = document.createElement('table');
    const head = document.createElement('tr');
    const heads = ['Item', 'Copy ID', 'Member', 'Due'];
    if (config.showRenewals) heads.push('Renewals');
    heads.push('');   // the button column has no title
    for (const text of heads) head.append(el('th', text));
    const thead = document.createElement('thead');
    thead.append(head);

    const tbody = document.createElement('tbody');
    for (const loan of shown) tbody.append(drawRow(loan));
    table.append(thead, tbody);
    scroll.replaceChildren(table);
  }

  // drawRow(loan): one table row with its button.
  function drawRow(loan) {
    const tr = document.createElement('tr');
    tr.dataset.copyId = loan.copy_id;   // lets reload() find this row again

    const item = el('td', loan.title);
    item.append(el('div', loan.item_type, 'muted'));
    tr.append(item);
    tr.append(el('td', loan.copy_id));
    const member = el('td', loan.member_name);
    member.append(el('div', loan.member_username, 'muted'));
    tr.append(member);

    // The due date, with a "late" mark when the book is overdue.
    const due = el('td', loan.due_date, 'nowrap');   // nowrap: keep the date on one line
    if (loan.overdue_days > 0) due.append(el('div', loan.overdue_days + ' days late', 'late-mark'));
    tr.append(due);

    if (config.showRenewals) tr.append(el('td', loan.renewal_count));

    // The action cell: an optional condition drop-down, then the button.
    const action = document.createElement('td');
    let condition = null;
    if (config.conditionChoice) {
      condition = document.createElement('select');
      condition.setAttribute('aria-label', 'Condition on return');
      for (const [value, text] of [['ok', 'Returned OK'], ['damaged', 'Damaged'], ['lost', 'Lost']]) {
        condition.append(new Option(text, value));
      }
      action.append(condition, ' ');
    }
    const button = el('button', config.buttonLabel);
    button.type = 'button';
    // canAct gives back a reason when the button must stay off (for example a short loan cannot be renewed).
    const reason = config.canAct ? config.canAct(loan) : null;
    if (reason) {
      button.disabled = true;
      action.append(button, el('div', reason, 'muted'));
    } else {
      button.addEventListener('click', () => press(loan, button, condition));
      action.append(button);
    }
    tr.append(action);
    return tr;
  }

  // ---------- Pressing a button ----------

  // press(loan, button, condition): sends the copy ID (and the condition, on the Return page)
  // to the server, then reloads the list so it matches the database.
  async function press(loan, button, condition) {
    const outcome = condition ? condition.value : null;

    // A damaged or lost copy adds a fine, so ask first (the shared in-page question box).
    if (outcome && outcome !== 'ok') {
      const question = (outcome === 'lost' ? 'Mark "' : 'Return "') + loan.title + (outcome === 'lost' ? '" as lost?' : '" as damaged?');
      if (!(await askInline(button, question, 'Yes'))) return;
    }

    button.disabled = true;   // so one press cannot be sent twice
    // Any old note on this row goes away before the new answer comes.
    const old = button.parentElement.querySelector('.row-note');
    if (old) old.remove();

    try {
      const body = { copy_id: loan.copy_id };
      if (outcome) body.outcome = outcome;
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (response.ok) {
        await reload(loan.copy_id, data.message, false);   // success: refresh, then show the answer
      } else {
        addNote(button.parentElement, data.message, true);  // refused: the reason stays on the row
        button.disabled = false;
      }
    } catch (err) {
      addNote(button.parentElement, 'Could not reach the server. Please try again.', true);
      button.disabled = false;
    }
  }

  // addNote(cell, text, isError): the answer under the button, green or red.
  function addNote(cell, text, isError) {
    const note = el('div', text, 'row-note ' + (isError ? 'bad' : 'ok'));
    note.setAttribute('role', 'status');   // screen readers read it out
    cell.append(note);
  }

  filter.addEventListener('input', draw);
  reload();
  return { reload: () => reload() };
}
