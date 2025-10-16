/**
 * Bulk Import Router
 * JSON import to DB.
 * Usage: Mount at /examples/bulk-import.
 * POST /import/:name: Body=export JSON; inserts docs, recreates indexes.
 * Notes: Batches inserts; skips _id index. Validates format.
 */
const express = require('express');
const router = express.Router();

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.post('/import/:name', async (req, res) => {
  try {
    await req.wrapper.bulkTasks.import(req.params.name, req.body);
    res.json({ message: `DB imported to ${req.params.name}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
