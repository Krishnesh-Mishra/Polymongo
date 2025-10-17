/**
 * Bulk Export Router
 * GET /export/:name: JSON export.
 */
const express = require('express');
const router = express.Router();
const { wrapper } = require('../src/models/index');

router.get('/export/:name', async (req, res) => {
  try {
    const data = await wrapper.bulkTasks.export(req.params.name);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
