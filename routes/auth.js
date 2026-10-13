const router = require('express').Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body; // field can hold a username or an email

    let isStaff = true;
    let [rows] = await db.execute(
      'SELECT Staff_id AS id, Password_hash, Is_active FROM Staff WHERE Email = ? LIMIT 1',
      [username]);

    if (!rows.length) {
      isStaff = false;
      [rows] = await db.execute(
        'SELECT Member_id AS id, Password_hash, Is_active FROM Member WHERE Username = ? OR Email = ? LIMIT 1',
        [username, username]);
    }

    const user = rows[0];
    if (!user || !user.Is_active || !(await bcrypt.compare(password, user.Password_hash))) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    req.session.userId = user.id;
    req.session.isStaff = isStaff;
    res.json({ message: 'Logged in.', isStaff });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out.' }));
});

module.exports = router;