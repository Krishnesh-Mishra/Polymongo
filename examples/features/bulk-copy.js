/**
 * Bulk Copy Router
 * Database duplication.
 * Usage: Mount at /examples/bulk-copy.
 * POST /copy/:source/:target: Copies collections/indexes.
 * Notes: Waits for connections; preserves data except _id indexes.
 */
const express = require('express');
const router = express.Router();

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.post('/copy/:source/:target', async (req, res) => {
  try {
    await req.wrapper.bulkTasks.copyDatabase(req.params.source, req.params.target);
    res.json({ message: `DB copied from ${req.params.source} to ${req.params.target}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
