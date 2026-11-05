// Staff page: search members, edit them, deactivate or reactivate accounts.
// Talks to the routes in routes/members.js (mounted at /api/members).
const rows = document.getElementById('rows');
const message = document.getElementById('message');
const editPanel = document.getElementById('editPanel');
const editForm = document.getElementById('editForm');

// The fields of the edit form, so they can be filled and read by name.
const FIELDS = ['firstName', 'lastName', 'email', 'memberType', 'phone', 'street', 'city', 'state', 'zip'];

// Shows a message at the top. ok = true gives the green style, false the red one.
function say(text, ok) {
  message.textContent = text;
  message.className = ok ? 'success' : 'error';
}

// Sends one request to /api/members and returns { res, data } (the answer as JSON).
async function api(path, method, body) {
  const res = await fetch('/api/members' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return { res, data: await res.json() };
}

// Makes one <td> with plain text (textContent, so member data can never be run as HTML).
function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

// Loads the members that match the search box and redraws the table.
// true for administrators (set by startPage at the bottom); decides whether the Edit / Deactivate buttons are drawn
let canEdit = false;

async function loadMembers({ keepMessage = false } = {}) {
  const q = encodeURIComponent(document.getElementById('search').value);
  const { res, data } = await api('?q=' + q, 'GET');
  if (!res.ok) return say(data.message, false);

  rows.innerHTML = '';
  for (const m of data) {
    const tr = document.createElement('tr');
    tr.appendChild(cell(m.Username));
    tr.appendChild(cell(m.First_name + ' ' + m.Last_name));
    tr.appendChild(cell(m.Email));
    tr.appendChild(cell(m.Type_name));
    tr.appendChild(cell(m.Is_active ? 'Active' : 'Inactive'));

    const actions = document.createElement('td');
    // Only administrators may edit or deactivate accounts. Staff just look members up
    // (the server refuses staff too, in routes/members.js); show an empty Actions cell.
    if (!canEdit) {
      tr.appendChild(actions);
      rows.appendChild(tr);
      continue;
    }

    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    // Staff-type members are linked to a staff account by an administrator, so no edit here.
    if (m.Type_name === 'Staff') {
      edit.disabled = true;
      edit.title = 'Linked to a staff account';
    }
    edit.addEventListener('click', () => openEdit(m));

    const toggle = document.createElement('button');
    toggle.textContent = m.Is_active ? 'Deactivate' : 'Reactivate';
    toggle.className = 'secondary';
    toggle.addEventListener('click', () => setActive(m, !m.Is_active));

    // Delete only works for an account with no loan or hold history (the server checks and says why if not).
    const remove = document.createElement('button');
    remove.textContent = 'Delete';
    remove.className = 'secondary';
    remove.addEventListener('click', () => deleteMember(m, remove));
    if (m.Type_name === 'Staff') remove.disabled = true;   // linked to a staff account
    actions.append(edit, toggle, remove);
    tr.appendChild(actions);
    rows.appendChild(tr);
  }

  if (!keepMessage) {
    if (data.length === 0) say('No members found.', false);
    else message.textContent = '';
  }
}

// Fills the edit form with one member's details and shows it.
function openEdit(m) {
  document.getElementById('memberId').value = m.Member_id;
  document.getElementById('editTitle').textContent = 'Edit ' + m.Username;
  document.getElementById('firstName').value = m.First_name;
  document.getElementById('lastName').value = m.Last_name;
  document.getElementById('email').value = m.Email;
  document.getElementById('memberType').value = m.Type_name;
  document.getElementById('phone').value = m.Phone || '';
  document.getElementById('street').value = m.Street || '';
  document.getElementById('city').value = m.City || '';
  document.getElementById('state').value = m.State || '';
  document.getElementById('zip').value = m.Zip_code || '';
  editPanel.hidden = false;
  editPanel.scrollIntoView();
}

// Deletes one account for good after an in-page question (inline-confirm.js), then refreshes the list.
async function deleteMember(m, button) {
  if (!(await askInline(button, 'Delete ' + m.Username + ' for good?', 'Yes, delete'))) return;
  const { res, data } = await api('/' + m.Member_id, 'DELETE');
  say(data.message, res.ok);
  if (res.ok) loadMembers({ keepMessage: true });
}

// Deactivates or reactivates one account, then refreshes the list.
async function setActive(m, active) {
  const { res, data } = await api('/' + m.Member_id + '/active', 'PATCH', { active });
  say(data.message, res.ok);
  if (res.ok) loadMembers({ keepMessage: true });
}

// Saves the edit form: collects the fields and sends them to PUT /api/members/:id.
editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {};
  for (const name of FIELDS) body[name] = document.getElementById(name).value;
  body.state = body.state.toUpperCase(); // the database only accepts capital letters

  const id = document.getElementById('memberId').value;
  const { res, data } = await api('/' + id, 'PUT', body);
  say(data.message, res.ok);
  if (res.ok) {
    editPanel.hidden = true;
    loadMembers({ keepMessage: true });
  }
});

document.getElementById('cancelBtn').addEventListener('click', () => { editPanel.hidden = true; });
document.getElementById('searchBtn').addEventListener('click', loadMembers);
document.getElementById('search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadMembers();
});

// Ask who is visiting (GET /me) before the first list is drawn: administrators get the
// Edit and Deactivate buttons, ordinary staff get a read-only list.
async function startPage() {
  try { canEdit = !!(await (await fetch('/me')).json()).isAdmin; } catch (e) { canEdit = false; }
  if (!canEdit) {
    const title = document.querySelector('h1');
    if (title) title.insertAdjacentHTML('afterend', '<p class="muted">You can look up members here. Only an administrator can edit or deactivate an account.</p>');
  }
  loadMembers(); // show everyone when the page opens
}
startPage();