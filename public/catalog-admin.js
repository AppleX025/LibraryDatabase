'use strict';
const $ = id => document.getElementById(id);
let currentId = null;
let picking = false;   // true while the Edit item tab is open but no item has been chosen yet
let catalog = [], publishers = [], authors = [];
// canEdit is true for administrators. Ordinary staff get a read-only catalog: they can look at an
// item and its copies (they need the Copy ID to check an item out) but cannot add, edit or withdraw.
// The server enforces this too (routes/catalog.js); this only hides the buttons they cannot use.
let canEdit = false;
const fields = {
  book: [['Isbn','ISBN (10 or 13 characters)'],['Genre','Genre']],
  videogame: [['Platform','Platform'],['Developer','Developer'],['Esrb_rating','ESRB rating']],
  boardgame: [['Min_players','Minimum players','number'],['Max_players','Maximum players','number'],['Designer','Designer']],
  dvd: [['Runtime_minutes','Runtime (minutes)','number'],['Director','Director'],['Mpaa_rating','MPAA rating']],
  music: [['Artist','Artist'],['Track_count','Track count','number']],
  newspaper: [['Newspaper_name','Newspaper name'],['Issue_date','Issue date','date'],['Edition','Edition'],['Is_historical','Historical issue','checkbox']],
  researchpaper: [['Doi','DOI'],['Journal_name','Journal name'],['Volume','Volume'],['Issue','Issue'],['Page_range','Page range']]
};
async function api(path, opts = {}) {
  const res = await fetch('/api/catalog' + path, { ...opts, headers: { 'Content-Type':'application/json', ...(opts.headers || {}) } });
  let data;
  try { data = await res.json(); } catch { throw new Error('Unexpected server response.'); }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Staff login required. Log in with a staff account.');
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}
function notify(message, error = false) { const n = $('notice'); n.hidden = false; n.textContent = message; n.classList.toggle('error', error); n.scrollIntoView({behavior:'smooth',block:'nearest'}); }
// showTab(tab): shows one panel and lights up its tab button. The add form and the edit form are the
// same panel ('item'), but they get their own tab buttons: "Add item" for a new item and "Edit item" while
// an item is open or while the admin is still searching for one (picking). Only admins see the Edit tab.
function showTab(tab) {
  document.querySelectorAll('.panel').forEach(p => { if (['catalog','item','people'].includes(p.id)) p.hidden = p.id !== tab; });
  const lit = (tab === 'item' && (currentId !== null || picking)) ? 'edit' : tab;   // which tab button to highlight
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === lit));
  document.querySelector('[data-tab="edit"]').hidden = !canEdit;
}
// pickItem(): the Edit item tab with nothing chosen yet. Hides the form and shows the search box,
// which lists the items whose title, category or publisher match what is typed.
function pickItem() {
  currentId = null; picking = true;
  $('itemHeading').textContent = 'Edit catalog item';
  $('itemForm').hidden = true; $('copiesPanel').hidden = true; $('findBox').hidden = false;
  $('findInput').value = ''; renderFind(); showTab('item'); $('findInput').focus();
}
// renderFind(): draws every match under the search box. The list scrolls (see #findResults in the CSS),
// so you can either type to narrow it down or just scroll to the item you want.
// Clicking a match opens its edit form through editItem().
function renderFind() {
  const q = $('findInput').value.trim().toLowerCase();
  const rows = catalog.filter(r => !q || [r.Title, r.Item_type, r.Publisher_name].some(v => String(v || '').toLowerCase().includes(q)));
  const box = $('findResults'); box.replaceChildren();
  if (!rows.length) { box.append(el('p', 'No matching items.', 'muted')); return; }
  rows.forEach(r => {
    const b = el('button', `${r.Title}  (${r.Item_type}, #${r.Item_id})`); b.type = 'button'; b.className = 'secondary';
    b.addEventListener('click', () => editItem(r.Item_id)); box.append(b);
  });
}
function el(tag, text, cls) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; }
function option(value, text) { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; }
function renderSelects() {
  const pub = $('publisherSelect'); const prev = pub.value; pub.replaceChildren(option('','No publisher'));
  publishers.forEach(p=>pub.append(option(p.Publisher_id,p.Name))); pub.value = prev;
  const auth = $('authorSelect'); const selected = [...auth.selectedOptions].map(o=>o.value); auth.replaceChildren();
  authors.forEach(a=>auth.append(option(a.Author_id,`${a.Last_name}, ${a.First_name}`)));
  [...auth.options].forEach(o=>o.selected=selected.includes(o.value));
  // Each name gets a Delete button (the server only allows it when nothing uses that publisher / author).
  $('publisherList').replaceChildren(...publishers.map(p=>listRow(p.Name,btn=>removePerson('publishers',p.Publisher_id,p.Name,btn))));
  $('authorList').replaceChildren(...authors.map(a=>listRow(`${a.First_name} ${a.Last_name}`,btn=>removePerson('authors',a.Author_id,`${a.First_name} ${a.Last_name}`,btn))));
}
async function loadLists() { [publishers,authors] = await Promise.all([api('/publishers'),api('/authors')]); renderSelects(); }
function renderCatalog() {
  const q = $('search').value.toLowerCase(); const rows = catalog.filter(r=>[r.Title,r.Item_type,r.Publisher_name].some(v=>String(v||'').toLowerCase().includes(q)));
  const body = $('catalogRows'); body.replaceChildren();
  if (!rows.length) { const tr=el('tr'); const td=el('td','No matching items.');td.colSpan=8;tr.append(td);body.append(tr);return; }
  rows.forEach(r=>{
    const tr=el('tr'); [r.Item_id,r.Title,r.Item_type,r.Publisher_name||'—',r.Total_copies,r.Available_copies,r.Withdrawn_copies].forEach(v=>tr.append(el('td',v)));
    const td=el('td');const b=el('button',canEdit?'Edit':'View copies');b.type='button';b.addEventListener('click',()=>editItem(r.Item_id));td.append(b);
    // Administrators can also delete an item: it is hidden from the app, nothing is removed from the database.
    if(canEdit){const d=el('button','Delete');d.type='button';d.className='secondary';d.addEventListener('click',()=>removeItem(r.Item_id,r.Title,d));td.append(' ',d);}
    tr.append(td);body.append(tr);
  });
}
async function loadCatalog() { catalog = await api('/items'); renderCatalog(); }
function renderExtras(values = {}) {
  const type = $('itemType').value; const container = $('extraFields'); container.replaceChildren();
  (fields[type]||[]).forEach(([name,title,kind])=>{
    const label=el('label',title); const input=el('input'); input.name=name; input.type=kind||'text';
    if (kind==='checkbox') input.checked=!!values[name]; else input.value=values[name]==null?'':kind==='date'?String(values[name]).slice(0,10):values[name];
    if (kind==='number') input.min='0'; if (name==='Newspaper_name'||name==='Issue_date') input.required=true;
    label.append(input);container.append(label);
  });
  $('authorPicker').hidden=!['book','researchpaper'].includes(type);
}
function newItem() {
  currentId=null; picking=false; $('findBox').hidden=true; $('itemForm').hidden=false; $('itemForm').reset(); $('itemType').disabled=false; $('itemHeading').textContent='Add catalog item'; $('fillExample').hidden=false;
  [...$('authorSelect').options].forEach(o=>o.selected=false);renderExtras();$('copiesPanel').hidden=true;showTab('item');
}
function fillForm(form, values) {
  for (const [key,value] of Object.entries(values)) {
    const control=form.elements.namedItem(key);if (!control) continue;
    if (control.type==='checkbox') control.checked=!!value;else control.value=value==null?'':value;
  }
}
// fillExample(): puts only the example title in the Add item form ("The Lord of the Rings"), so a demo
// starts with the name already there and the team fills in the rest of the data entry live (category,
// publisher, year, cost and the category details). It only fills the form: nothing is saved until Save item is pressed.
function fillExample() {
  fillForm($('itemForm'),{Title:'The Lord of the Rings'});
  $('itemForm').elements.namedItem('Title').focus();
}
async function editItem(id) {
  try {
    const item=await api('/items/'+id); currentId=id; picking=false; $('findBox').hidden=true; $('fillExample').hidden=true; $('itemForm').reset();
    fillForm($('itemForm'),item); $('itemType').disabled=true; renderExtras(item);
    [...$('authorSelect').options].forEach(o=>o.selected=item.Author_ids.includes(Number(o.value)));
    $('itemHeading').textContent=canEdit?`Edit item #${id}`:`Copies of "${item.Title}"`; $('copiesPanel').hidden=false; renderCopies(item.copies); $('dateAcquired').value=new Date().toISOString().slice(0,10);
    // Staff only look: hide the item form and the "Add a copy" form (the copies table stays).
    $('itemForm').hidden=!canEdit; $('copyForm').hidden=!canEdit; showTab('item');
  } catch(e) { notify(e.message,true); }
}
function renderCopies(copies) {
  const body=$('copyRows');body.replaceChildren();
  if (!copies.length) {const tr=el('tr');const td=el('td','No copies yet.');td.colSpan=5;tr.append(td);body.append(tr);}
  copies.forEach(c=>{
    const tr=el('tr');[c.Copy_id,c.Condition,c.Shelf_location||'—',c.Status].forEach(v=>tr.append(el('td',v)));
    const td=el('td');
    if(canEdit){
      // Withdraw keeps the record and its history (only for an available copy).
      if(c.Status==='available'){const b=el('button','Withdraw');b.type='button';b.addEventListener('click',()=>withdraw(c.Copy_id,b));td.append(b,' ');}
      // Delete hides the copy from the app (the server keeps the row and its history).
      const d=el('button','Delete');d.type='button';d.className='secondary';d.addEventListener('click',()=>removeCopy(c.Copy_id,d));td.append(d);
    } else td.textContent='—';
    tr.append(td);body.append(tr);
  });
}
// withdraw(id, button): asks inside the page first (askInline, inline-confirm.js), then withdraws the copy.
// listRow(text, onDelete): one <li> with a name and a small Delete button.
function listRow(text, onDelete) {
  const li=el('li',text+' ');const b=el('button','Delete');b.type='button';b.className='secondary';
  b.addEventListener('click',()=>onDelete(b));li.append(b);return li;
}
// removeItem(id, title, button): asks inside the page, then deletes the item. "Delete" only hides it:
// the server marks the item and its copies as deleted and keeps the rows. It refuses (and says why)
// while a copy is on loan.
async function removeItem(id, title, button) {
  if (!(await askInline(button, `Delete "${title}"?`, 'Yes, delete'))) return;
  try { const r=await api(`/items/${id}`,{method:'DELETE'});await loadCatalog();notify(r.message); }catch(e){notify(e.message,true);}
}
// removeCopy(id, button): deletes (hides) one copy. The server refuses while it is on loan or set aside for a hold.
async function removeCopy(id, button) {
  if (!(await askInline(button, `Delete copy #${id}?`, 'Yes, delete'))) return;
  try { const r=await api(`/copies/${id}`,{method:'DELETE'});await Promise.all([editItem(currentId),loadCatalog()]);notify(r.message); }catch(e){notify(e.message,true);}
}
// removePerson(kind, id, name, button): deletes (hides) a publisher or an author no visible item uses ('publishers' or 'authors').
async function removePerson(kind, id, name, button) {
  if (!(await askInline(button, `Delete "${name}"?`, 'Yes, delete'))) return;
  try { const r=await api(`/${kind}/${id}`,{method:'DELETE'});await loadLists();notify(r.message); }catch(e){notify(e.message,true);}
}
async function withdraw(id, button) {
  if (!(await askInline(button, 'Withdraw this copy?', 'Yes, withdraw'))) return;
  try { const r=await api(`/copies/${id}/withdraw`,{method:'PATCH'});await Promise.all([editItem(currentId),loadCatalog()]);notify(r.message); }catch(e){notify(e.message,true);}
}
$('itemType').addEventListener('change',()=>renderExtras());
$('fillExample').addEventListener('click',fillExample);
$('itemForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const f=$('itemForm');const values=Object.fromEntries(new FormData(f));
  values.Item_type=$('itemType').value;
  if(values.Item_type==='newspaper') values.Is_historical=!!f.elements.namedItem('Is_historical').checked;
  values.Author_ids=[...$('authorSelect').selectedOptions].map(o=>Number(o.value));
  try {
    const id=currentId;const result=await api(id?`/items/${id}`:'/items',{method:id?'PUT':'POST',body:JSON.stringify(values)});
    await loadCatalog();await editItem(id||result.Item_id);notify(result.message+(id?'':' You can now add physical copies below.'));
  } catch(err){notify(err.message,true);}
});
$('copyForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!currentId)return;
  const values=Object.fromEntries(new FormData($('copyForm')));
  try {const r=await api(`/items/${currentId}/copies`,{method:'POST',body:JSON.stringify(values)});$('copyForm').reset();await Promise.all([editItem(currentId),loadCatalog()]);notify(r.message);}
  catch(err){notify(err.message,true);}
});
$('publisherForm').addEventListener('submit',async e=>{
  e.preventDefault();try{const r=await api('/publishers',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});e.target.reset();await loadLists();notify(`Publisher "${r.Name}" added.`);}catch(err){notify(err.message,true);}
});
$('authorForm').addEventListener('submit',async e=>{
  e.preventDefault();try{await api('/authors',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});e.target.reset();await loadLists();notify('Author added.');}catch(err){notify(err.message,true);}
});
$('search').addEventListener('input',renderCatalog);$('findInput').addEventListener('input',renderFind);
$('newItem').addEventListener('click',newItem);$('cancelItem').addEventListener('click',()=>showTab('catalog'));
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.tab==='item')newItem();else if(b.dataset.tab==='edit'){if(currentId!==null)editItem(currentId);else pickItem();}else showTab(b.dataset.tab);}));
// applyRole(): ask the server who this is (GET /me) and, for staff who are not administrators,
// hide everything that changes the catalog. Runs before the catalog is drawn.
async function applyRole() {
  try { canEdit = !!(await (await fetch('/me')).json()).isAdmin; } catch (e) { canEdit = false; }
  if (!canEdit) {
    $('newItem').hidden = true;
    document.querySelector('[data-tab="item"]').hidden = true;
    document.querySelector('[data-tab="edit"]').hidden = true;
    document.querySelector('[data-tab="people"]').hidden = true;
  }
}
(async()=>{try{await applyRole();await Promise.all([loadCatalog(),loadLists()]);$('dateAcquired').value=new Date().toISOString().slice(0,10);}catch(e){notify(e.message,true);}})();
