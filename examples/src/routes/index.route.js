/**
 * Index Router
 * Aggregates all sub-routers for clean mounting.
 * Usage: app.use('/', indexRouter(wrapper)); Handles req.wrapper passthrough.
 * Includes: users, posts, seed, all features examples.
 * Notes: req.wrapper = app.locals.wrapper ensures access in sub-routes.
 */
const express = require('express');
const router = express.Router();
const userRouter = require('./user.route');
const postRouter = require('./post.route');
const seedRouter = require('./seed.route');
const basicRouter = require('../../features/basic');
const transactionRouter = require('../../features/transaction');
const watchRouter = require('../../features/watch');
const hooksRouter = require('../../features/hooks');
const scaleRouter = require('../../features/scale');
const statsRouter = require('../../features/stats');
const bulkCopyRouter = require('../../features/bulk-copy');
const bulkDropRouter = require('../../features/bulk-drop');
const bulkExportRouter = require('../../features/bulk-export');
const bulkImportRouter = require('../../features/bulk-import');
const bulkStreamExportRouter = require('../../features/bulk-stream-export');
const bulkStreamImportRouter = require('../../features/bulk-stream-import');

router.use((req, res, next) => {
  req.wrapper = req.app.locals.wrapper;
  next();
});

router.use('/users', userRouter);
router.use('/posts', postRouter);
router.use('/seed', seedRouter);
router.use('/examples/basic', basicRouter);
router.use('/examples/transaction', transactionRouter);
router.use('/examples/watch', watchRouter);
router.use('/examples/hooks', hooksRouter);
router.use('/examples/scale', scaleRouter);
router.use('/examples/stats', statsRouter);
router.use('/examples/bulk-copy', bulkCopyRouter);
router.use('/examples/bulk-drop', bulkDropRouter);
router.use('/examples/bulk-export', bulkExportRouter);
router.use('/examples/bulk-import', bulkImportRouter);
router.use('/examples/bulk-stream-export', bulkStreamExportRouter);
router.use('/examples/bulk-stream-import', bulkStreamImportRouter);

module.exports = router;
