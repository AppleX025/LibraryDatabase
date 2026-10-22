# What each person still has to do

Group 6, Library Database. Checkpoint #3 is due **Tue Oct 27**.

| When | What |
|---|---|
| Wed Oct 21 | Start your list below. Push to your own branch as soon as something works, even half done. |
| **Thu Oct 22** | **Features finished and pushed.** After this day we only test and fix. |
| Fri Oct 23 to Mon Oct 26 | Testing only. Josh sends the final email to the TAs on Oct 26. |

This file lists what is **missing** for each person. It is not a complaint about anyone: it is just the list, so you know exactly where to put your time. If something is unclear or too big, tell Josh early and we will split it.

---

## Before you start (everyone)

1. **Work on top of the `no-express` branch** until Josh says it is merged into `main`. Our TA said Express is not allowed, so the whole server was rebuilt with only the tools that come with Node.js. Then create your own branch from it:
   ```
   git fetch
   git checkout no-express
   git pull
   git checkout -b your-branch-name
   npm install
   ```
2. **Add a line to your `.env` file:** `SESSION_SECRET=` followed by any long random text (see `.env.example` for the other settings). The app refuses to start without it.
3. **Reload your database with these 8 files, in this order:** `schema.sql`, `seed_accounts.sql`, `trigger_overdue_fine.sql`, `Sample_data.sql`, `circulation.sql`, `trigger_hold_ready.sql`, `trigger_hold_completed.sql`, `reports.sql` (all in the `database` folder). The test passwords changed format, so an old database will refuse the test logins.
4. **Start the app** with `npm start` and open `http://localhost:3000` (or the PORT in your `.env`). It opens the search page.

**Test logins** (the password is `testpass123` for all of them):

| Login | Who |
|---|---|
| `staff@test.com`, `librarian@test.com` | Staff |
| `admin@test.com` | Administrator (staff who can also waive fines) |
| `testmember`, `alice_r`, `eva_s`, `bob_m`, `carla_f`, `dan_c` | Members |

### Rules for the code we all write

- **Routes:** begin a route file with `const { Router } = require('../lib/router'); const router = Router();`. Do not use `require('express')`. Everything else (`req.body`, `req.params`, `req.query`, `res.status(...).json(...)`) works the same.
- **Passwords:** use `hashPassword` and `verifyPassword` from `lib/password.js`. The bcrypt package is gone.
- **Table names:** write them exactly as in `schema.sql` (`Hold`, `Copy`, `CatalogItem`, `Member`, ...). Lowercase fails on a Linux MySQL server, and Azure runs Linux.
- **Errors:** send `{ message: '...' }` from the server.
- **Pages:** every page has the shared header, `<nav><span id="authLink"></span></nav>`, and `<script src="/auth-nav.js"></script>` at the bottom. The menu links are built by `auth-nav.js`, so a new link is added there once, never by hand in a page. Put `data-access="staff"` (staff only) or `data-access="login"` (any logged-in person) on the page's `<body>`; leave it off for public pages. No inline `<style>` blocks; styles go in the shared `.css` files.
- **Comments:** explain what each function and each non-obvious line does, in plain English.
- **When you finish a piece:** push your branch and tell Josh. Josh does the merges.

---

## Juan: accounts and access

Nothing from you is on GitHub yet. If anything is half done, push it today so we can look and help.

We no longer need a separate `account.html`. Members land on the Search page after login, and Josh is building the member pages (My loans, My fines, Notifications). What is left for you:

### 1. Registration (most important)

A visitor who is not logged in can create a member account.

- [ ] **Page:** `public/register.html` (public, no `data-access`). Fields from the `Member` table: username, first name, last name, email, password, member type, and the optional phone, street, city, state, zip.
- [ ] **Route:** `POST /register` in `routes/auth.js`. Save the password with `hashPassword` from `lib/password.js`, never as plain text.
- [ ] **Member type:** offer Student, Faculty and Alumni only. The Staff type is for library employees and is linked to a staff account by an administrator, so it must not be choosable here.
- [ ] **Clear messages for bad input.** Username and email must be unique (answer 409 with a clear message). The database also refuses a bad email, a phone with letters, a zip that is not `12345` or `12345-6789`, and a state that is not 2 capital letters; show those as plain-English messages, not a server error.
- [ ] **Links:** a "Create an account" link on the login page, and a Register link in the logged-out menu (`buildMenu` in `auth-nav.js`).
- [ ] **Done when:** you can register a new member, log in with it, search, and place a hold. A duplicate username or email shows a clear message.

### 2. Member management for staff

The design says staff can register new members, edit member records and deactivate an account.

- [ ] **Page:** `public/members-admin.html` with `data-access="staff"`. List or search members (by name, username or email), edit a member's details and member type, and deactivate or reactivate an account.
- [ ] **Routes:** a new `routes/members.js` with `isStaff` on every route, mounted in `app.js` at `/api/members` (copy the line for `/api/fines`). Add a link to `STAFF_LINKS` in `auth-nav.js`.
- [ ] **Deactivate, never delete:** set `Is_active = FALSE`. The database refuses to delete a member who has history. Login already refuses inactive accounts.
- [ ] **Done when:** as `staff@test.com` you can find `alice_r`, change her phone number, deactivate her, and see that she can no longer log in.

### 3. Optional, if there is time

- [ ] A page where an **administrator** adds a staff account (`isAdmin` guard in `middleware/auth.js`). Ask Josh first; we have not decided that we need it.
- [ ] A short staff landing page. It is less urgent now, because the menu already links every staff page.

---

## Adan: catalog admin

Merged and tested; thank you. Two small fixes remain, both in `routes/catalog.js`.

- [ ] **An impossible date gives a server error.** The check on dates only looks at the shape (`YYYY-MM-DD`), so `2026-02-31` gets through and MySQL then refuses it. This affects `Date_acquired` when adding a copy and the issue date of a newspaper. Check that the date is a real calendar day, and answer `400` with a clear message such as "Enter a real date."
- [ ] **A date shows one day off.** The server sends dates as JavaScript dates, which are in UTC, so in Texas a date can show as the day before. In the `SELECT`, ask MySQL for plain text instead: `DATE_FORMAT(Date_acquired, '%Y-%m-%d') AS Date_acquired`. `routes/fines.js` already does this with `Date_assessed`; copy that pattern for every date the catalog routes return (the copy list, newspaper issue dates).
- [ ] **Done when:** adding a copy with date `2026-02-31` shows a clear message, and a copy added on `2026-10-14` shows `2026-10-14` in the table.

Good to know: adding a copy now checks the barcode format, `LIB-` followed by 4 to 8 digits (saved in upper case). The shared menu script now sends a logged-out visitor to the login page, so you no longer need the 403 redirect we talked about.

---

## Farwa: search and holds

Merged and working. Staff can now place holds for themselves through their linked member account, so please try the holds pages once as `librarian@test.com` and once as `eva_s`. What is left is small and optional, in this order:

- [ ] **A friendlier message on the Search page.** Search is now the first page anyone sees, so many visitors are logged out. Today pressing Place Hold only says "You must be logged in.". Better: for a logged-out visitor show a "Log in to place a hold" link (ask `/me`, as `auth-nav.js` does). A staff account with no member account (for example `staff@test.com` before the sample data is reloaded) gets a clear message already.
- [ ] **Colored labels for hold status** in My Holds: Active, Ready, Completed, Cancelled and Expired. The status text is already there; it needs a one-line class per status in `search.css`.
- [ ] **An item page** with more detail than the results table (authors, publisher, copies and their status).
- [ ] **Tidy the error messages.** `holds.js` and its three pages use `{ error: ... }`; our shared rule is `{ message: ... }`. Change the server and the pages together, or leave it; both work today.

Important: **do not merge your `search-holds` branch again.** It has its own copy of the hold-ready trigger, and we use the one that is in `main`. Make new work on a branch from `no-express`.

---

## Austin: circulation

Merged and working end to end (checkout, return, renew, open loans, with holds). Heads up: staff now see **every** member's open loans on the Open loans page (a box narrows it to one member). What is left:

### 1. Damaged and lost items (most important)

At the moment a returned item is always treated as fine, and nothing creates a damaged or lost fine.

- [x] **Return page** (`public/circulation/return.html`): add a choice next to the barcode: returned **OK**, **damaged**, or **lost**. Send it to the server with the barcode.
- [x] **Route** (`POST /api/circulation/return` in `routes/circulation.js`): read the choice (anything else than the three values is a `400`). For damaged or lost, add a row in `Fine` with `Fine_type` `'damaged'` or `'lost'`, `Amount` equal to the item's `Replacement_cost` in `CatalogItem`, and the other columns left to their defaults. The table allows **one fine of each type per loan**, so returning the same loan twice cannot add the fine twice.
- [x] **The copy:** a damaged copy gets `Condition = 'damaged'`. A lost copy gets `Status = 'lost'`, so nobody can borrow it. A lost item still needs its loan closed; the table requires `Return_date` and `Return_staff_id` to be set together.
- [ ] **Talk to Josh about one thing:** the hold-ready trigger gives a returned copy to the next waiting member. A damaged or lost copy should probably not be handed on. Decide together whether the trigger should skip those. _(Done provisionally: `trigger_hold_ready.sql` now skips lost/damaged copies, but it still needs Josh's OK, and everyone must re-run that one file.)_
- [x] **Done when:** returning a loan as damaged shows a Damaged fine for the replacement cost on the Fines page (`/fines-admin.html`), and returning one as lost shows a Lost fine. _(Verified end to end against a local MySQL copy.)_
- [x] **Extra (beyond the list):** a lost item is paid for in full, so a late lost return no longer also charges an overdue fine. A lost return now **waives the overdue fine**, while damaged items are unchanged (still charged if late). In `routes/circulation.js`.

### 2. Return page wording

- [x] The message says "set it aside for holds", but by then the hold is already Ready. Better: "This copy is reserved for the next member's hold."

### 3. Optional

- [ ] The design says a member can **request a renewal**; today only staff can renew. Skip this unless everything above is finished.

---

## Josh (for everyone's information)

Josh is doing: the member pages in the menu (My loans, My fines with a Pay button, Notifications), hold expiry after the 2-day pickup window, the hosting on Azure, and the final email on Oct 26.
