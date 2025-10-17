/**
 * Bulk Stream Export Router
 * GET /stream-export/:name: Streamed JSON.
 */
const express = require('express');
const router = express.Router();
const { wrapper } = require('../src/models/index');

router.get('/stream-export/:name', (req, res) => {
  const stream = wrapper.bulkTasks.exportStream(req.params.name);
  res.set('Content-Type', 'application/json');
  stream.pipe(res);
});

module.exports = router;
