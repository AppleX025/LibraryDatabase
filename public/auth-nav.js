// public/auth-nav.js
// Shared script loaded by the pages. It asks the server who is visiting, then:
//   1. draws the menu in the page's header <nav> (what each kind of visitor sees),
//   2. fills the <span id="authLink"> with a "Login" link (logged out) or a
//      "Log out" button (logged in),
//   3. sends visitors away from pages they may not use (see "Page guard" below).
// Every page loads this one file, so the menu is changed in this one place.

// ---------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------
// The links each kind of visitor sees: [text, address, optional folder].
// The optional third item is for a link that stands for a whole group of pages:
// "Reports" opens the overdue report, but it stays highlighted on every page
// whose address starts with /reports/.
const SEARCH_LINK  = ['Search', '/search.html'];
const REGISTER_LINK = ['Register', '/register.html'];
// A member sees only their own loans on this page (staff see everyone's under "Open loans").
const LOANS_LINK   = ['My Loans', '/circulation/open-loans.html'];
// A member pays their own unpaid fines on this page (staff use "Fines").
const FINES_LINK   = ['My Fines', '/my-fines.html'];
// A member reads their own notifications on this page (hold ready, fines, due dates).
const NOTES_LINK   = ['My Notifications', '/my-notifications.html'];
// A member edits their own details and password on this page. A staff login uses it too,
// for the member record linked to the staff account (and the staff login password).
const PROFILE_LINK = ['My Profile', '/profile.html'];
const MEMBER_LINKS = [LOANS_LINK, ['My Holds', '/my-holds.html'], FINES_LINK, NOTES_LINK, PROFILE_LINK];
const STAFF_LINKS  = [
  ['Catalog',    '/catalog-admin.html'],
  ['Checkout',   '/circulation/checkout.html'],
  ['Return',     '/circulation/return.html'],
  ['Renew',      '/circulation/renew.html'],
  ['Open loans', '/circulation/open-loans.html'],
  ['Fines',      '/fines-admin.html'],
  ['Members',    '/members-admin.html'],
  ['Holds',      '/staff-holds.html'],
  ['My Holds',   '/my-holds.html'],      // staff who also borrow place holds for themselves
  ['Reports',    '/reports/overdue.html', '/reports/'],
  PROFILE_LINK
];

// buildMenu(me): returns the list of links for this visitor.
// me is the answer from /me: { loggedIn, isStaff, isAdmin, name }
function buildMenu(me) {
  if (!me.loggedIn) return [SEARCH_LINK, REGISTER_LINK];     // only Search and Register
  // Staff get the circulation links. Reports are for administrators only, so an
  // ordinary staff member does not see that link (the server refuses them anyway).
  if (me.isStaff)   return [SEARCH_LINK, ...STAFF_LINKS.filter(link => link[0] !== 'Reports' || me.isAdmin)];
  return [SEARCH_LINK, ...MEMBER_LINKS];                    // Search plus the member links
}

// drawMenu(links): empties the page's <nav> and adds one <a> per link,
// marking the link that matches this page (location.pathname) with aria-current="page".
// The <span id="authLink"> must stay at the end of the nav, so take it out first and put it back.
function drawMenu(links) {
  const nav = document.querySelector('header nav');
  const authLink = document.getElementById('authLink');
  // A page without a header menu (or without the authLink spot) has nothing to draw into.
  if (!nav || !authLink) return;

  nav.innerHTML = '';
  for (const [text, address, folder] of links) {
    const a = document.createElement('a');
    a.textContent = text;
    a.href = address;
    // This page is the link's own page, or (for a group link) any page in its folder.
    const here = location.pathname === address || (folder && location.pathname.startsWith(folder));
    if (here) a.setAttribute('aria-current', 'page');
    nav.appendChild(a);
  }
  nav.appendChild(authLink);
}

// ---------------------------------------------------------------------
// Logo, footer and shortcut tiles
// ---------------------------------------------------------------------
// The look of the whole app comes from theme.css. These small helpers add the
// parts that need a little script: the logo, the footer, and the home-page tiles.

// addLogo(): puts the small three-book logo in front of the name in the header.
// The logo is an inline <svg> drawn here, so the app needs no image file.
function addLogo() {
  const brand = document.querySelector('header div');
  // Not every page has a header, and the logo must only be added once.
  if (!brand || brand.querySelector('svg')) return;

  const svgNS = 'http://www.w3.org/2000/svg';   // the address that tells the browser "this is an SVG shape"
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '34');
  svg.setAttribute('height', '34');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('aria-hidden', 'true');       // decoration only: screen readers skip it

  // Three book spines: [x, y, height, color, opacity]
  const spines = [
    [4, 6, 28, '#0f4c5c', '1'],
    [15, 10, 24, '#f2a900', '1'],
    [26, 4, 30, '#0f4c5c', '0.7']
  ];
  for (const [x, y, height, color, opacity] of spines) {
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', '9');
    rect.setAttribute('height', height);
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', color);
    rect.setAttribute('opacity', opacity);
    svg.appendChild(rect);
  }
  brand.prepend(svg);   // prepend = put it first, before the name
}

// footerColumns(me): the link columns at the bottom of the page, for this kind of visitor.
// Each column is [title, [[text, address], ...]].
function footerColumns(me) {
  const find = [['Search the catalog', '/search.html']];
  if (!me.loggedIn) {
    return [['Find', find], ['Account', [['Login', '/login.html'], ['Register', '/register.html']]]];
  }
  if (me.isStaff) {
    return [
      ['Find', find],
      ['Circulation', [['Checkout', '/circulation/checkout.html'], ['Return', '/circulation/return.html'],
                       ['Renew', '/circulation/renew.html'], ['Open loans', '/circulation/open-loans.html']]],
      ['Manage', [['Catalog', '/catalog-admin.html'], ['Members', '/members-admin.html'],
                  ['Fines', '/fines-admin.html'],
                  ...(me.isAdmin ? [['Reports', '/reports/overdue.html']] : [])]]   // Reports: administrators only
    ];
  }
  return [
    ['Find', find],
    ['My account', [['My Loans', '/circulation/open-loans.html'], ['My Holds', '/my-holds.html'],
                    ['My Fines', '/my-fines.html'], ['My Profile', '/profile.html']]]
  ];
}

// drawFooter(me): adds the footer (theme.css styles it) to the end of the page.
function drawFooter(me) {
  // A page that already has a footer, or was given one before, is left alone.
  if (document.querySelector('.site-footer')) return;

  const footer = document.createElement('footer');
  footer.className = 'site-footer';

  // Left block: the name and one line about the project.
  const about = document.createElement('div');
  about.className = 'about';
  const name = document.createElement('strong');
  name.textContent = 'Library Database';
  const line = document.createElement('span');
  line.textContent = 'A library management project for COSC 3380, University of Houston.';
  about.append(name, line);
  footer.appendChild(about);

  // One block per column, each with a title and its links.
  for (const [title, links] of footerColumns(me)) {
    const column = document.createElement('div');
    column.className = 'column';
    const heading = document.createElement('strong');
    heading.textContent = title;
    column.appendChild(heading);
    for (const [text, address] of links) {
      const a = document.createElement('a');
      a.textContent = text;
      a.href = address;
      column.appendChild(a);
    }
    footer.appendChild(column);
  }
  document.body.appendChild(footer);
}

// shortcutTiles(me): the big tiles on the home page: [title, short line, address].
function shortcutTiles(me) {
  if (me.isStaff) {
    return [
      ['Checkout',   'Lend an item, or pick up a hold.',   '/circulation/checkout.html'],
      ['Return',     'Take an item back in.',              '/circulation/return.html'],
      ['Fines',      me.isAdmin ? 'Collect or waive fines.' : 'Collect fines.', '/fines-admin.html'],
      ['Members',    me.isAdmin ? 'Find and edit member accounts.' : 'Look up member accounts.', '/members-admin.html'],
      // Reports are for administrators only
      ...(me.isAdmin ? [['Reports', 'Overdue loans, fines, borrowing.', '/reports/overdue.html']] : [])
    ];
  }
  return [
    ['My Loans',         'What is due, and renew.',            '/circulation/open-loans.html'],
    ['My Holds',         'Your place in line and pickups.',    '/my-holds.html'],
    ['My Fines',         'See what you owe and pay it.',       '/my-fines.html'],
    ['Notifications',    'Hold-ready and fine notices.',       '/my-notifications.html'],
    ['My Profile',       'Update your details and password.',  '/profile.html']
  ];
}

// drawShortcuts(me): fills the <div id="shortcuts"> on the home page, only for logged-in visitors.
// Other pages do not have that div, so nothing happens there.
function drawShortcuts(me) {
  const spot = document.getElementById('shortcuts');
  if (!spot || !me.loggedIn) return;

  for (const [title, line, address] of shortcutTiles(me)) {
    const a = document.createElement('a');
    a.href = address;
    const strong = document.createElement('strong');
    strong.textContent = title;
    const span = document.createElement('span');
    span.textContent = line;
    a.append(strong, span);
    spot.appendChild(a);
  }
  spot.hidden = false;   // the tiles start hidden so a visitor who is not logged in never sees an empty box
}

// ---------------------------------------------------------------------
// Page guard
// ---------------------------------------------------------------------
// A page marks who may use it with an attribute on its <body>:
//   <body data-access="admin">   administrators only (reports)
//   <body data-access="staff">   staff only (catalog, circulation, fines, reports, staff holds)
//   <body data-access="login">   any logged-in person (My Holds, My Loans)
//   no attribute                 open to everyone (Search, Login)
// Someone who may not use the page is sent away before they see an error:
// a visitor who is not logged in goes to the login page, and a logged-in member
// who opened a staff page goes to Search. (The server still refuses their data
// requests either way; this only keeps them from landing on a broken page.)
// Returns true when the visitor was sent away.
function guardPage(me) {
  const access = document.body.dataset.access;   // reads the data-access attribute
  const mayStay = access === 'admin' ? me.isAdmin
                : access === 'staff' ? me.isStaff
                : access === 'login' ? me.loggedIn
                : true;
  if (mayStay) return false;

  window.location.href = me.loggedIn ? '/search.html' : '/login.html';
  return true;
}

// ---------------------------------------------------------------------
// Login / Log out control
// ---------------------------------------------------------------------
// Builds the menu, the page guard and the Login link or Log out button.
// "async" lets us use "await" inside to wait for the server's answers.
async function setupAuthLink() {
  // Ask the server who is visiting (the GET /me route in routes/auth.js).
  // "await" pauses here until the server answers.
  const response = await fetch('/me');

  // Read the answer as JSON, e.g. { loggedIn: true, isStaff: false, isAdmin: false, name: 'Eva' }.
  const me = await response.json();

  // Not allowed on this page? Then the visitor is already on their way elsewhere.
  if (guardPage(me)) return;

  // Draw the menu for this kind of visitor, then the logo, the footer and the home-page tiles.
  drawMenu(buildMenu(me));
  addLogo();
  drawFooter(me);
  drawShortcuts(me);

  // Find the empty <span id="authLink"> on the page. We put the control inside it.
  const spot = document.getElementById('authLink');

  if (me.loggedIn) {
    // The visitor is logged in, so build a Log out button.
    const button = document.createElement('button');
    button.textContent = 'Log out';

    // When the button is clicked, run this function.
    button.addEventListener('click', async () => {
      // Tell the server to end the session. /logout only accepts POST,
      // so the method must be 'POST' (a GET would be ignored).
      await fetch('/logout', { method: 'POST' });

      // Session is gone, so send the visitor to the login page.
      window.location.href = '/login.html';
    });

    // Greet the person by first name so they can see who is logged in.
    // me.name is null when the server has no name for this session (for example a
    // session that started before names were saved), so then there is no greeting.
    if (me.name) {
      const nameSpan = document.createElement('span');
      // textContent shows the name as plain text, never as page code.
      nameSpan.textContent = `Hello, ${me.name}!`;
      // The class lets the stylesheets colour it and space it from the button.
      nameSpan.className = 'greeting';
      // Added before the button, so it appears to the left of "Log out".
      spot.appendChild(nameSpan);
    }

    // Put the finished button on the page, inside the placeholder.
    spot.appendChild(button);
  } else {
    // The visitor is not logged in, so build a Login link.
    const link = document.createElement('a');
    link.textContent = 'Login';
    link.href = '/login.html';   // the page with the form, not the /login route

    // Put the link on the page, inside the placeholder.
    spot.appendChild(link);
  }
}

// Run the function as soon as the page loads this script.
setupAuthLink();