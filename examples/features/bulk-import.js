/**
 * Bulk Import Router
 * POST /import/:name: Import JSON body.
 */
const express = require('express');
const router = express.Router();
const { wrapper } = require('../src/models/index');

router.post('/import/:name', async (req, res) => {
  try {
    await wrapper.bulkTasks.import(req.params.name, req.body);
    res.json({ message: `DB imported to ${req.params.name}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
