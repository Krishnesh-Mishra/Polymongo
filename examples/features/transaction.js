/**
 * Transaction Features Router
 * Atomic operations across models.
 * Usage: Mount at /examples/transaction.
 * POST /create-user-post: Body {name, email}; creates user+post or rolls back.
 * Notes: Uses wrapper.transaction() with session. Requires replica set for full support.
 */
const express = require('express');
const router = express.Router();
const UserModel = require('../src/models/User');
const PostModel = require('../src/models/Post');

router.use((req, res, next) => { req.wrapper = req.wrapper; next(); });

router.post('/create-user-post', async (req, res) => {
  try {
    const result = await req.wrapper.transaction(async (session) => {
      const user = await (req.wrapper.wrapModel(UserModel)).create([{ name: req.body.name, email: req.body.email }], { session });
      await (req.wrapper.wrapModel(PostModel)).create([{ title: 'New Post', userId: user[0]._id }], { session });
      return { user: user[0], success: true };
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
