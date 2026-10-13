require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./config/db');

// Catch any unhandled errors so the app tells us why it's closing
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false
}));

app.use(express.static('public'));
app.use('/', require('./routes/auth'));


// Test database route

app.get('/', (req, res) => {
    res.send('Library Database Server is running!');
});
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS solution');
    res.json({ message: 'Database connected.', solution: rows[0].solution });
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).json({ message: 'Database failed to connect.', error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`PORT ${PORT} IS ALREADY IN USE! Close other running servers or use a different port.`);
  } else {
    console.error('Server startup error:', err);
  }
});