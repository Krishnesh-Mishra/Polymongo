/**
 * Bulk Export Router
 * JSON export of DB.
 * Usage: Mount at /examples/bulk-export.
 * GET /export/:name: Returns {database, exportDate, collections: {docs, indexes}}.
 * Notes: Full data dump; use for backups. Handles all collections.
 */
const express = require('express');
const router = express.Router();

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.get('/export/:name', async (req, res) => {
  try {
    const data = await req.wrapper.bulkTasks.export(req.params.name);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
