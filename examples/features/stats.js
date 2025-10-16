/**
 * Stats Features Router
 * Connection and DB metrics.
 * Usage: Mount at /examples/stats.
 * GET /general: Pool stats across all connections.
 * GET /db/:name: Detailed DB stats (size, collections).
 * GET /list-dbs: All DBs with sizes.
 * Notes: Real-time pool metrics; collection counts estimated.
 */
const express = require('express');
const router = express.Router();

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.get('/general', (req, res) => {
  res.json(req.wrapper.stats.general());
});

router.get('/db/:name', async (req, res) => {
  try {
    const stats = await req.wrapper.stats.db(req.params.name);
    res.json(stats);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/list-dbs', async (req, res) => {
  try {
    const dbs = await req.wrapper.stats.listDatabases();
    res.json(dbs);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
