/**
 * Scale Features Router
 * Separate connection pools.
 * Usage: Mount at /examples/scale.
 * POST /set-db: Configs 'analytics' (lazy).
 * POST /connect-db: Connects 'cache' immediately.
 * Notes: autoClose/ttl for idle cleanup. maxConnections per pool.
 */
const express = require('express');
const router = express.Router();

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.post('/set-db', (req, res) => {
  req.wrapper.scale.setDB(['analytics'], { maxConnections: 20, autoClose: true, ttl: 300000 });
  res.json({ message: 'Analytics DB configured' });
});

router.post('/connect-db', async (req, res) => {
  try {
    await req.wrapper.scale.connectDB(['cache'], { maxConnections: 5 });
    res.json({ message: 'Cache DB connected' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
