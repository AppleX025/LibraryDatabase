// =====================================================================
// public/home-notices.js
// The "Your notices" panel on the home page (search.html), for logged-in MEMBERS.
//
// Why it exists: a member used to have to open the Notifications page to learn that an item
// is overdue or that a fine is growing. Now the unread notices are on the home page, right
// under the search bar, in the place where the My Fines / Notifications / My Holds buttons
// used to be. The notices themselves are made by the database triggers (overdue fines:
// trigger_fine_notify.sql; hold ready: trigger_hold_ready.sql); this file only shows them.
//
// auth-nav.js calls drawNotices() after it knows who is logged in (see drawShortcuts there).
// All text goes in with textContent, so a title with "<" or "&" can never be read as page code.
// =====================================================================

// What each notice type is called on its badge, and whether it is a warning (red) or good news (green).
const NOTICE_KINDS = {
  overdue:       { label: 'Overdue',       tone: 'warn', link: ['See my fines', '/my-fines.html'] },
  fine_assessed: { label: 'Fine',          tone: 'warn', link: ['See my fines', '/my-fines.html'] },
  due_soon:      { label: 'Due soon',      tone: 'info', link: ['My loans', '/circulation/open-loans.html'] },
  hold_ready:    { label: 'Hold ready',    tone: 'good', link: ['My holds', '/my-holds.html'] },
  fine_paid:     { label: 'Fine paid',     tone: 'good', link: null },
  fine_waived:   { label: 'Fine waived',   tone: 'good', link: null }
};

// noticeEl(tag, text, className): makes one element with plain text inside.
function noticeEl(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// drawNotices(): fills <div id="notices"> with the member's unread notices.
// Does nothing when the page has no such div. Called once by auth-nav.js for a logged-in member,
// and again by itself after a notice is dismissed.
async function drawNotices() {
  const box = document.getElementById('notices');
  if (!box) return;

  // Ask the server for this member's notifications (newest first, see routes/notifications.js).
  let all;
  try {
    const response = await fetch('/api/notifications');
    if (!response.ok) { box.hidden = true; return; }   // for example a staff login: no notices of its own
    all = await response.json();
  } catch (err) {
    box.hidden = true;   // the home page still works without the panel
    return;
  }
  const unread = all.filter((n) => !n.Is_read);

  box.replaceChildren();
  box.hidden = false;

  // The heading line, and "Mark all as read" when there is something to mark.
  const top = noticeEl('div', null, 'notices-top');
  top.append(noticeEl('h2', unread.length === 0 ? 'Your notices' : 'Your notices (' + unread.length + ' new)'));
  if (unread.length > 0) {
    const readAll = noticeEl('button', 'Mark all as read', 'secondary');
    readAll.type = 'button';
    readAll.addEventListener('click', async () => {
      readAll.disabled = true;   // so one press cannot be sent twice
      await fetch('/api/notifications/read-all', { method: 'POST' });
      drawNotices();
    });
    top.append(readAll);
  }
  box.append(top);

  // Nothing new: say so, in one calm line.
  if (unread.length === 0) {
    box.append(noticeEl('p', 'You are all caught up. Nothing new right now.', 'muted'));
  }

  // One card per unread notice.
  for (const n of unread) {
    const kind = NOTICE_KINDS[n.Notification_type] || { label: 'Notice', tone: 'info', link: null };
    const card = noticeEl('div', null, 'notice notice-' + kind.tone);
    card.setAttribute('role', 'status');

    const text = noticeEl('div', null, 'notice-text');
    text.append(noticeEl('span', kind.label, 'notice-badge'));
    text.append(noticeEl('span', n.Message, 'notice-message'));
    text.append(noticeEl('span', n.Date_sent, 'notice-date'));
    card.append(text);

    const actions = noticeEl('div', null, 'notice-actions');
    if (kind.link) {
      const go = noticeEl('a', kind.link[0]);
      go.href = kind.link[1];
      actions.append(go);
    }
    const dismiss = noticeEl('button', 'Dismiss', 'secondary');
    dismiss.type = 'button';
    dismiss.addEventListener('click', async () => {
      dismiss.disabled = true;
      await fetch('/api/notifications/' + n.Notification_id + '/read', { method: 'POST' });
      drawNotices();   // redraw, so the card disappears and the count goes down
    });
    actions.append(dismiss);
    card.append(actions);
    box.append(card);
  }

  // The old shortcut buttons, as plain links in one line, so every page is still one click away.
  const links = noticeEl('p', null, 'notices-links');
  for (const [title, address] of [['My loans', '/circulation/open-loans.html'], ['My holds', '/my-holds.html'],
                                  ['My fines', '/my-fines.html'], ['All notifications', '/my-notifications.html'],
                                  ['My profile', '/profile.html']]) {
    const a = noticeEl('a', title);
    a.href = address;
    links.append(a);
  }
  box.append(links);
}
