const router = require('express').Router();
const db = require('../config/db');

// GET /fines
// Returns a JSON array of all unpaid fines, with the member's name and email,
// the title of the item, and the fine type, amount, and date assessed.
// The array is sorted by amount descending (largest first). 