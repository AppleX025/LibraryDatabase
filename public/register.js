// Sends the registration form to POST /register and shows the server's answer.
const form = document.getElementById('registerForm');
const message = document.getElementById('message'); // red error box
const success = document.getElementById('success'); // green success box

// Runs when the form is submitted (button click or Enter).
form.addEventListener('submit', async (e) => {
  e.preventDefault(); // stop the normal page reload
  message.textContent = '';
  success.textContent = '';

  // Collect every field by its name attribute into a plain object.
  const body = Object.fromEntries(new FormData(form).entries());
  // The database only accepts capital letters for the state.
  body.state = (body.state || '').toUpperCase();

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (res.ok) {
      form.reset();
      success.textContent = data.message; // "Account created. You can now log in."
    } else {
      message.textContent = data.message; // e.g. "That username is already taken..."
    }
  } catch (err) {
    message.textContent = 'Could not reach the server. Please try again.';
  }
});