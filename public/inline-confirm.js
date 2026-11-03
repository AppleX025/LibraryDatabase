// public/inline-confirm.js
// A small shared helper that asks "Are you sure?" INSIDE the page,
// instead of the browser's own pop-up (confirm()).
//
// How a page uses it:
//     if (!(await askInline(button, 'Waive this fine?', 'Yes, waive'))) return;
// "await" pauses until the person answers. The answer is true for Yes and false for Cancel.
//
// What the person sees: the button they clicked is replaced, in the same spot, by
// the question and two buttons (Yes and Cancel). Their look comes from theme.css (.confirm-box).

// askInline(button, question, yesText)
//   button:   the button that was clicked (the question appears right after it)
//   question: the sentence to ask, for example 'Waive this fine?'
//   yesText:  the words on the Yes button (optional, "Yes" if left out)
// Returns a Promise that becomes true (Yes) or false (Cancel).
function askInline(button, question, yesText) {
  return new Promise((resolve) => {
    // The box that holds the question and the two buttons.
    const box = document.createElement('span');
    box.className = 'confirm-box';
    box.setAttribute('role', 'alertdialog');          // tells screen readers a question is waiting
    box.setAttribute('aria-label', question);

    // The question itself. textContent shows it as plain text, never as page code.
    const text = document.createElement('span');
    text.textContent = question;

    const yes = document.createElement('button');
    yes.type = 'button';                              // so it never submits a form
    yes.textContent = yesText || 'Yes';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';                   // the outlined look for the less important choice
    cancel.textContent = 'Cancel';

    box.append(text, yes, cancel);

    // finish(answer): remove the box, bring the original button back, and give the answer.
    function finish(answer) {
      box.remove();
      button.hidden = false;
      resolve(answer);
    }
    yes.addEventListener('click', () => finish(true));
    cancel.addEventListener('click', () => finish(false));
    // Escape means Cancel, like the browser's own pop-up.
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(false);
    });

    // Hide the clicked button and show the question in its place.
    button.hidden = true;
    button.after(box);                                // "after" puts the box right behind the button
    cancel.focus();                                   // the safe choice is focused, so Enter does not confirm by accident
  });
}
