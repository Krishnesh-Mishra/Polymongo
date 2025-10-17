/**
 * Watch Features Router
 * GET /start-watch: Logs Post changes in 'Polymongo'.
 * POST /close-watch: Closes streams for 'Polymongo'.
 */
const express = require('express');
const router = express.Router();
const { wrapper, User } = require('../src/models/index');

router.get('/start-watch', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = User.db('Polymongo').watch();

  stream.on('change', (change) => {
    console.log('Post changed:', change);
    // Send change to client as SSE
    res.write(`data: ${JSON.stringify(change)}\n\n`);
  });

  stream.on('error', (error) => {
    console.error('Stream error:', error);
    res.write(`event: error\ndata: ${JSON.stringify(error)}\n\n`);
  });

  stream.on('close', () => {
    console.error('Stream Closed');
    res.end();
  });

  // Keep connection alive
  req.on('close', () => {
    stream.close();
    res.end();
  });
});


router.post('/close-watch', (req, res) => {
  wrapper.actions.closeDBstream('Polymongo');
  res.json({ message: 'Watch closed' });
});

module.exports = router;
