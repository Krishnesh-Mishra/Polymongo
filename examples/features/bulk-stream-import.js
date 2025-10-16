/**
 * Bulk Stream Import Router
 * Memory-efficient JSON import.
 * Usage: Mount at /examples/bulk-stream-import.
 * POST /stream-import/:name: Body=JSON data; batches 1000 docs.
 * Notes: Converts body to Readable stream. Handles large imports without OOM.
 */
const express = require('express');
const router = express.Router();
const { Readable } = require('stream');

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.post('/stream-import/:name', async (req, res) => {
  try {
    const data = req.body;
    const stream = new Readable({
      read() {
        this.push(JSON.stringify(data));
        this.push(null);
      }
    });
    await req.wrapper.bulkTasks.importStream(req.params.name, stream);
    res.json({ message: `Stream imported to ${req.params.name}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
