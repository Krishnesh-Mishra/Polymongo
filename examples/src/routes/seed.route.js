/**
 * Seed Routes
 * POST /seed/users: Creates Alice/Bob users.
 * POST /seed/posts: Creates posts linked to users.
 */
const express = require('express');
const router = express.Router();
const { User, Post } = require('../models/index');

router.post('/users', async (req, res) => {
  try {
    const users = await User.insertMany([
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' }
    ]);
    res.status(201).json(users);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/posts', async (req, res) => {
  try {
    const users = await User.find({});
    if (users.length < 2) return res.status(400).json({ error: 'Seed users first' });
    const posts = await Post.insertMany([
      { title: 'First Post', content: 'Hello', userId: users[0]._id },
      { title: 'Second Post', content: 'World', userId: users[1]._id }
    ]);
    res.status(201).json(posts);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
