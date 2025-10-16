/**
 * Bulk Stream Export Router
 * Memory-efficient JSON streaming.
 * Usage: Mount at /examples/bulk-stream-export.
 * GET /stream-export/:name: Pipes JSON stream to response (pipe to file via curl).
 * Notes: Progressive output; ideal for large DBs. JSON structure like export.
 */
const express = require('express');
const router = express.Router();

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.get('/stream-export/:name', (req, res) => {
  const stream = req.wrapper.bulkTasks.exportStream(req.params.name);
  res.set('Content-Type', 'application/json');
  stream.pipe(res);
});

module.exports = router;
