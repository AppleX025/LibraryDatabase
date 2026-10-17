// public/auth-nav.js
// Shared script loaded by the pages. It asks the server whether the visitor
// is logged in, then fills the <span id="authLink"> on the page with either
// a "Login" link (logged out) or a "Log out" button (logged in).

// Builds the Login link or Log out button.
// "async" lets us use "await" inside to wait for the server's answers.
async function setupAuthLink() {
  // Ask the server who is visiting (the GET /me route in routes/auth.js).
  // "await" pauses here until the server answers.
  const response = await fetch('/me');

  // Read the answer as JSON, e.g. { loggedIn: true, isStaff: false }.
  const me = await response.json();

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