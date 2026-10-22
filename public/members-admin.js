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
async function loadMembers() {
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

    actions.append(edit, toggle);
    tr.appendChild(actions);
    rows.appendChild(tr);
  }
  if (data.length === 0) say('No members found.', false);
  else message.textContent = '';
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

// Deactivates or reactivates one account, then refreshes the list.
async function setActive(m, active) {
  const { res, data } = await api('/' + m.Member_id + '/active', 'PATCH', { active });
  say(data.message, res.ok);
  if (res.ok) loadMembers();
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
    loadMembers();
  }
});

document.getElementById('cancelBtn').addEventListener('click', () => { editPanel.hidden = true; });
document.getElementById('searchBtn').addEventListener('click', loadMembers);
document.getElementById('search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadMembers();
});

loadMembers(); // show everyone when the page opens