/**
 * Transaction Features Router
 * POST /create-user-post: {name, email}; creates user+post atomically.
 */
const express = require('express');
const router = express.Router();
const { wrapper, User, Post } = require('../src/models/index');

router.post('/create-user-post', async (req, res) => {
  try {
    const result = await wrapper.transaction(async (session) => {
      const user = await User.create([{ name: req.body.name, email: req.body.email }], { session });
      await Post.create([{ title: 'New Post', userId: user[0]._id }], { session });
      return { user: user[0], success: true };
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
