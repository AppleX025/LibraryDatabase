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
// A member sees only their own loans on this page (staff see everyone's under "Open loans").
const LOANS_LINK   = ['My Loans', '/circulation/open-loans.html'];
// A member pays their own unpaid fines on this page (staff use "Fines").
const FINES_LINK   = ['My Fines', '/my-fines.html'];
// A member reads their own notifications on this page (hold ready, fines, due dates).
const NOTES_LINK   = ['My Notifications', '/my-notifications.html'];
const MEMBER_LINKS = [LOANS_LINK, ['My Holds', '/my-holds.html'], FINES_LINK, NOTES_LINK];
const STAFF_LINKS  = [
  ['Catalog',    '/catalog-admin.html'],
  ['Checkout',   '/circulation/checkout.html'],
  ['Return',     '/circulation/return.html'],
  ['Renew',      '/circulation/renew.html'],
  ['Open loans', '/circulation/open-loans.html'],
  ['Fines',      '/fines-admin.html'],
  ['Holds',      '/staff-holds.html'],
  ['My Holds',   '/my-holds.html'],      // staff who also borrow place holds for themselves
  ['Reports',    '/reports/overdue.html', '/reports/']
];

// buildMenu(me): returns the list of links for this visitor.
// me is the answer from /me: { loggedIn, isStaff, isAdmin, name }
function buildMenu(me) {
  if (!me.loggedIn) return [SEARCH_LINK];                   // only Search
  if (me.isStaff)   return [SEARCH_LINK, ...STAFF_LINKS];   // Search plus the staff links
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
// Page guard
// ---------------------------------------------------------------------
// A page marks who may use it with an attribute on its <body>:
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
  const mayStay = access === 'staff' ? me.isStaff
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

  // Draw the menu for this kind of visitor.
  drawMenu(buildMenu(me));

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