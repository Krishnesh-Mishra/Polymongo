/**
 * Bulk Copy Router
 * POST /copy/:source/:target: Copies DB.
 */
const express = require('express');
const router = express.Router();
const { wrapper } = require('../src/models/index');

router.post('/copy/:source/:target', async (req, res) => {
  try {
    await wrapper.bulkTasks.copyDatabase(req.params.source, req.params.target);
    res.json({ message: `DB copied from ${req.params.source} to ${req.params.target}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
