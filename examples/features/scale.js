/**
 * Scale Features Router
 * POST /set-db: Configs 'analytics'.
 * POST /connect-db: Connects 'cache'.
 */
const express = require('express');
const router = express.Router();
const { wrapper } = require('../src/models/index');

router.post('/set-db', (req, res) => {
  wrapper.scale.setDB(['analytics'], { maxConnections: 20, autoClose: true, ttl: 300000 });
  res.json({ message: 'Analytics DB configured' });
});

router.post('/connect-db', async (req, res) => {
  try {
    await wrapper.scale.connectDB(['cache'], { maxConnections: 5 });
    res.json({ message: 'Cache DB connected' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
