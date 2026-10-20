const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Search catalog by title or author, optional category filter.
router.get('/api/search', async (req, res) => {
  try {
    const text = (req.query.q || '').trim();
    const category = (req.query.category || '').trim();
    const like = `%${text}%`;

    const sql = `
      SELECT ci.Item_id, ci.Title, ci.Item_type,
        (SELECT COUNT(*)
           FROM Copy c
          WHERE c.Item_id = ci.Item_id
            AND c.Status = 'available'
            AND c.Copy_id NOT IN (
                  SELECT Reserved_copy_id FROM Hold
                   WHERE Status = 'Ready' AND Reserved_copy_id IS NOT NULL)
        ) AS available_copies
      FROM CatalogItem ci
      WHERE (
              ci.Title LIKE ?
           OR ci.Item_id IN (
                SELECT ba.Item_id
                  FROM BookAuthor ba
                  JOIN Author a ON a.Author_id = ba.Author_id
                 WHERE CONCAT(a.First_name, ' ', a.Last_name) LIKE ?)
           OR ci.Item_id IN (
                SELECT pa.Item_id
                  FROM PaperAuthor pa
                  JOIN Author a ON a.Author_id = pa.Author_id
                 WHERE CONCAT(a.First_name, ' ', a.Last_name) LIKE ?)
            )
        AND (? = '' OR ci.Item_type = ?)
      ORDER BY ci.Title
      LIMIT 100`;

    const [rows] = await db.query(sql, [like, like, like, category, category]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed. Please try again.' });
  }
});

module.exports = router;