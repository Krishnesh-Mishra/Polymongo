/**
 * Bulk Drop Router
 * DELETE /drop/:name: Drops DB.
 */
const express = require('express');
const router = express.Router();
const { wrapper } = require('../src/models/index');

router.delete('/drop/:name', async (req, res) => {
  try {
    await wrapper.bulkTasks.dropDatabase(req.params.name);
    res.json({ message: `DB ${req.params.name} dropped` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
