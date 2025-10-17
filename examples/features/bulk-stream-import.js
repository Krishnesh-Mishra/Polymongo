/**
 * Bulk Stream Import Router
 * POST /stream-import/:name: Stream import from body.
 */
const express = require('express');
const router = express.Router();
const { Readable } = require('stream');
const { wrapper } = require('../src/models/index');

router.post('/stream-import/:name', async (req, res) => {
  try {
    const data = req.body;
    const stream = new Readable({
      read() {
        this.push(JSON.stringify(data));
        this.push(null);
      }
    });
    await wrapper.bulkTasks.importStream(req.params.name, stream);
    res.json({ message: `Stream imported to ${req.params.name}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
