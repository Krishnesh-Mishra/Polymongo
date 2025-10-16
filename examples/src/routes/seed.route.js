/**
 * Seed Routes
 * Populate DB with sample data for testing.
 * Usage: Mount at /seed. Run after server start.
 * POST /seed/users: Creates Alice/Bob users.
 * POST /posts: Creates posts linked to seeded users.
 * Notes: Idempotent; uses insertMany. Check /users for verification.
 */
const express = require('express');
const router = express.Router();
const UserModel = require('../models/User');
const PostModel = require('../models/Post');

router.use((req, res, next) => { req.wrapper = req.app.locals.wrapper; next(); });

router.post('/users', async (req, res) => {
  try {
    const users = await (req.wrapper.wrapModel(UserModel)).insertMany([
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' }
    ]);
    res.status(201).json(users);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/posts', async (req, res) => {
  try {
    const users = await (req.wrapper.wrapModel(UserModel)).find({});
    if (users.length < 2) return res.status(400).json({ error: 'Seed users first' });
    const posts = await (req.wrapper.wrapModel(PostModel)).insertMany([
      { title: 'First Post', content: 'Hello', userId: users[0]._id },
      { title: 'Second Post', content: 'World', userId: users[1]._id }
    ]);
    res.status(201).json(posts);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
