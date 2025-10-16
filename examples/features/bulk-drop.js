/**
 * Bulk Drop Router
 * Database deletion.
 * Usage: Mount at /examples/bulk-drop.
 * DELETE /drop/:name: Drops DB and clears cache/streams.
 * Notes: Irreversible; closes associated watches.
 */
const express = require('express');
const router = express.Router();

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.delete('/drop/:name', async (req, res) => {
  try {
    await req.wrapper.bulkTasks.dropDatabase(req.params.name);
    res.json({ message: `DB ${req.params.name} dropped` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
