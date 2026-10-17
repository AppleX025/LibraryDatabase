'use strict';
const $ = id => document.getElementById(id);
let currentId = null;
let catalog = [], publishers = [], authors = [];
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
function showTab(tab) { document.querySelectorAll('.panel').forEach(p => { if (['catalog','item','people'].includes(p.id)) p.hidden = p.id !== tab; }); document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active',b.dataset.tab === tab)); }
function el(tag, text, cls) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; }
function option(value, text) { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; }
function renderSelects() {
  const pub = $('publisherSelect'); const prev = pub.value; pub.replaceChildren(option('','No publisher'));
  publishers.forEach(p=>pub.append(option(p.Publisher_id,p.Name))); pub.value = prev;
  const auth = $('authorSelect'); const selected = [...auth.selectedOptions].map(o=>o.value); auth.replaceChildren();
  authors.forEach(a=>auth.append(option(a.Author_id,`${a.Last_name}, ${a.First_name}`)));
  [...auth.options].forEach(o=>o.selected=selected.includes(o.value));
  $('publisherList').replaceChildren(...publishers.map(p=>el('li',p.Name)));
  $('authorList').replaceChildren(...authors.map(a=>el('li',`${a.First_name} ${a.Last_name}`)));
}
async function loadLists() { [publishers,authors] = await Promise.all([api('/publishers'),api('/authors')]); renderSelects(); }
function renderCatalog() {
  const q = $('search').value.toLowerCase(); const rows = catalog.filter(r=>[r.Title,r.Item_type,r.Publisher_name].some(v=>String(v||'').toLowerCase().includes(q)));
  const body = $('catalogRows'); body.replaceChildren();
  if (!rows.length) { const tr=el('tr'); const td=el('td','No matching items.');td.colSpan=8;tr.append(td);body.append(tr);return; }
  rows.forEach(r=>{
    const tr=el('tr'); [r.Item_id,r.Title,r.Item_type,r.Publisher_name||'—',r.Total_copies,r.Available_copies,r.Withdrawn_copies].forEach(v=>tr.append(el('td',v)));
    const td=el('td');const b=el('button','Edit');b.type='button';b.addEventListener('click',()=>editItem(r.Item_id));td.append(b);tr.append(td);body.append(tr);
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
  currentId=null; $('itemForm').reset(); $('itemType').disabled=false; $('itemHeading').textContent='Add catalog item';
  [...$('authorSelect').options].forEach(o=>o.selected=false);renderExtras();$('copiesPanel').hidden=true;showTab('item');
}
function fillForm(form, values) {
  for (const [key,value] of Object.entries(values)) {
    const control=form.elements.namedItem(key);if (!control) continue;
    if (control.type==='checkbox') control.checked=!!value;else control.value=value==null?'':value;
  }
}
async function editItem(id) {
  try {
    const item=await api('/items/'+id); currentId=id; $('itemForm').reset();
    fillForm($('itemForm'),item); $('itemType').disabled=true; renderExtras(item);
    [...$('authorSelect').options].forEach(o=>o.selected=item.Author_ids.includes(Number(o.value)));
    $('itemHeading').textContent=`Edit item #${id}`; $('copiesPanel').hidden=false; renderCopies(item.copies); $('dateAcquired').value=new Date().toISOString().slice(0,10);showTab('item');
  } catch(e) { notify(e.message,true); }
}
function renderCopies(copies) {
  const body=$('copyRows');body.replaceChildren();
  if (!copies.length) {const tr=el('tr');const td=el('td','No copies yet.');td.colSpan=5;tr.append(td);body.append(tr);}
  copies.forEach(c=>{
    const tr=el('tr');[c.Barcode,c.Condition,c.Shelf_location||'—',c.Status].forEach(v=>tr.append(el('td',v)));
    const td=el('td');if(c.Status==='available') {const b=el('button','Withdraw');b.type='button';b.addEventListener('click',()=>withdraw(c.Copy_id));td.append(b);}else td.textContent='—';tr.append(td);body.append(tr);
  });
}
async function withdraw(id) {
  if (!confirm('Withdraw this copy? The record and loan history will be preserved.')) return;
  try { const r=await api(`/copies/${id}/withdraw`,{method:'PATCH'});await Promise.all([editItem(currentId),loadCatalog()]);notify(r.message); }catch(e){notify(e.message,true);}
}
$('itemType').addEventListener('change',()=>renderExtras());
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
$('search').addEventListener('input',renderCatalog);
$('newItem').addEventListener('click',newItem);$('cancelItem').addEventListener('click',()=>showTab('catalog'));
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.tab==='item')newItem();else showTab(b.dataset.tab);}));
$('logout').addEventListener('click',async()=>{await fetch('/logout',{method:'POST'});location.href='/login.html';});
(async()=>{try{await Promise.all([loadCatalog(),loadLists()]);$('dateAcquired').value=new Date().toISOString().slice(0,10);}catch(e){notify(e.message,true);}})();
