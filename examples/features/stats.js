/**
 * Stats Features Router
 * GET /general: Pool stats.
 * GET /db/:name: DB stats.
 * GET /list-dbs: All DBs with sizes.
 */
const express = require('express');
const router = express.Router();
const { wrapper } = require('../src/models/index');

router.get('/general', (req, res) => {
  res.json(wrapper.stats.general());
});

router.get('/db/:name', async (req, res) => {
  try {
    const stats = await wrapper.stats.db(req.params.name);
    res.json(stats);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/list-dbs', async (req, res) => {
  try {
    const dbs = await wrapper.stats.listDatabases();
    res.json(dbs);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
