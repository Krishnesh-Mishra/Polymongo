/**
 * Basic Features Router
 * GET /multi-db: Users from default and 'admin' DB.
 * GET /status: Connection status.
 */
const express = require('express');
const router = express.Router();
const { wrapper, User } = require('../src/models/index');

router.get('/multi-db', async (req, res) => {
  try {
    const defaultUsers = await User.find({});
    const adminUsers = await User.db('admin').find({});
    res.json({ default: defaultUsers, admin: adminUsers });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/status', (req, res) => {
  res.json({ isConnected: wrapper.isConnected(), state: wrapper.getConnectionState() });
});

module.exports = router;
