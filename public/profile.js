// public/profile.js
// Script for profile.html ("My profile").
//
// How this page works:
//   1. On load it asks GET /api/profile for the member's details and fills the boxes.
//   2. "Save changes" sends the boxes to PUT /api/profile.
//   3. "Change password" sends the three password boxes to PUT /api/profile/password.
// Every rule is checked on the server (routes/profile.js), never only here,
// because anything in the browser can be changed by the person using it.

// Grab the parts of the page the script needs to work with.
const summary = document.getElementById('summary');
const notice = document.getElementById('notice');
const detailsPanel = document.getElementById('detailsPanel');
const passwordPanel = document.getElementById('passwordPanel');
const detailsForm = document.getElementById('detailsForm');
const passwordForm = document.getElementById('passwordForm');
const saveButton = document.getElementById('saveButton');
const undoButton = document.getElementById('undoButton');
const passwordButton = document.getElementById('passwordButton');

// The details as last loaded or saved, so "Undo changes" can put them back.
let savedProfile = null;

// showMessage(text, isError): shows a line in the message box.
// Green by default; when isError is true the 'error' class makes it red.
// textContent (not innerHTML) shows the text as plain text, never as page code.
function showMessage(text, isError) {
    notice.textContent = text;
    notice.hidden = false;                        // the box starts hidden
    notice.className = isError ? 'error' : '';
}

// readJson(response): reads the server's answer as an object.
// If the answer is not valid JSON it gives back an empty object, so the code
// after it can still show its own message instead of crashing.
async function readJson(response) {
    try {
        return await response.json();
    } catch (err) {
        return {};
    }
}

// fillForm(profile): puts the saved details into the boxes.
// A detail the member never gave is null, which shows as an empty box ('').
function fillForm(profile) {
    for (const field of ['firstName', 'lastName', 'email', 'phone', 'street', 'city', 'state', 'zip']) {
        detailsForm[field].value = profile[field] ?? '';
    }
}

// loadProfile(): asks the server for the member's details and shows them.
async function loadProfile() {
    try {
        const response = await fetch('/api/profile');
        const data = await readJson(response);

        if (!response.ok) {
            // A staff login lands here: the server says it has no member profile.
            summary.textContent = '';
            showMessage(data.message || 'Could not load your profile.', true);
            return;
        }

        savedProfile = data;
        // The three things the member cannot change, shown as one line.
        summary.textContent = 'Username: ' + data.username + '  |  Member type: ' + data.memberType +
            '  |  Registered: ' + data.dateRegistered;
        fillForm(data);
        detailsPanel.hidden = false;      // both forms start hidden until there is a profile to show
        passwordPanel.hidden = false;
    } catch (err) {
        summary.textContent = '';
        showMessage('Could not reach the server. Please try again.', true);
    }
}

// Runs when "Save changes" is pressed (or Enter in a box).
detailsForm.addEventListener('submit', async (event) => {
    // Stop the browser's normal form submit (a full page reload); we send it with fetch instead.
    event.preventDefault();
    // Grey out the button while waiting, so one save cannot be sent twice.
    saveButton.disabled = true;

    // Collect the boxes into a plain object. The state is sent in capitals (TX, not tx).
    const body = Object.fromEntries(new FormData(detailsForm).entries());
    body.state = (body.state || '').toUpperCase();

    try {
        const response = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await readJson(response);
        showMessage(data.message || 'Something went wrong.', !response.ok);

        if (response.ok) {
            // Remember what is now saved, and show the capital-letter state.
            savedProfile = { ...savedProfile, ...body };
            fillForm(savedProfile);
        }
    } catch (err) {
        showMessage('Could not reach the server. Please try again.', true);
    } finally {
        saveButton.disabled = false;
    }
});

// "Undo changes": put the boxes back to what is saved.
undoButton.addEventListener('click', () => {
    if (savedProfile) fillForm(savedProfile);
    notice.hidden = true;
});

// Runs when "Change password" is pressed.
passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    passwordButton.disabled = true;

    // The three password boxes, sent to the server as JSON.
    const body = Object.fromEntries(new FormData(passwordForm).entries());

    try {
        const response = await fetch('/api/profile/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await readJson(response);
        showMessage(data.message || 'Something went wrong.', !response.ok);

        // After a successful change, empty the boxes so no password stays on the screen.
        if (response.ok) passwordForm.reset();
    } catch (err) {
        showMessage('Could not reach the server. Please try again.', true);
    } finally {
        passwordButton.disabled = false;
    }
});

// Load the member's details as soon as the page opens.
loadProfile();
