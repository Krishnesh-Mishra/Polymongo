/**
 * Basic Features Router
 * Demonstrates core multi-DB switching and status checks.
 * Usage: Mount at /examples/basic.
 * GET /multi-db: Fetches from default and 'admin' DB (creates if needed).
 * GET /status: Returns isConnected() and getConnectionState().
 * Notes: Highlights wrapModel().db() for seamless DB switching.
 */
const express = require('express');
const router = express.Router();
const UserModel = require('../src/models/User');

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.get('/multi-db', async (req, res) => {
  try {
    const defaultUsers = await req.wrapper.wrapModel(UserModel).find({});
    const adminUsers = await req.wrapper.wrapModel(UserModel).db('admin').find({});
    res.json({ default: defaultUsers, admin: adminUsers });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/status', (req, res) => {
  res.json({ isConnected: req.wrapper.isConnected(), state: req.wrapper.getConnectionState() });
});

module.exports = router;
