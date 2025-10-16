/**
 * Watch Features Router
 * MongoDB change streams with auto-cleanup.
 * Usage: Mount at /examples/watch.
 * GET /start-watch: Starts console logging on Post changes in 'Polymongo'.
 * POST /close-watch: Closes all streams for 'Polymongo'.
 * Notes: Uses model.watch(); tracked by WatchManager. Logs changes/errors.
 */
const express = require('express');
const router = express.Router();
const PostModel = require('../src/models/Post');

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.get('/start-watch', (req, res) => {
  const stream = req.wrapper.wrapModel(PostModel).db('Polymongo').watch();
  stream.on('change', (change) => console.log('Post changed:', change));
  stream.on('error', (error) => console.error('Stream error:', error));
  res.json({ message: 'Watch started on console' });
});

router.post('/close-watch', (req, res) => {
  req.wrapper.actions.closeDBstream('Polymongo');
  res.json({ message: 'Watch closed' });
});

module.exports = router;
