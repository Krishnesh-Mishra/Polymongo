/**
 * Hooks Features Router
 * Connection event callbacks.
 * Usage: Mount at /examples/hooks.
 * GET /setup-hooks: Registers global/specific hooks; logs to console on connect.
 * Notes: onDbConnect/onTheseDBConnect. Triggers on connection events.
 */
const express = require('express');
const router = express.Router();

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.get('/setup-hooks', (req, res) => {
  req.wrapper.onDbConnect((db) => console.log(`Connected to ${db.name}`));
  req.wrapper.onTheseDBConnect(['admin'], (db) => console.log(`Admin connected: ${db.name}`));
  res.json({ message: 'Hooks registered, check console on DB events' });
});

module.exports = router;
