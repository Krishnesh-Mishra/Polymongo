/**
 * Hooks Features Router
 * GET /setup-hooks: Registers console log hooks.
 */
const express = require('express');
const router = express.Router();
const { wrapper } = require('../src/models/index');

router.get('/setup-hooks', (req, res) => {
  wrapper.onDbConnect((db) => console.log(`Connected to ${db.name}`));
  wrapper.onTheseDBConnect(['admin'], (db) => console.log(`Admin connected: ${db.name}`));
  res.json({ message: 'Hooks registered, check console on DB events' });
});

module.exports = router;
