/**
 * Post Routes
 * CRUD for Post model with populate.
 * GET /posts: List posts with populated user.
 * POST /posts: Create post {title, content, userId}.
 */
const express = require('express');
const router = express.Router();
const { Post } = require('../models/index');

router.get('/', async (req, res) => {
  try {
    const posts = await Post.find({}).populate('userId');
    res.json(posts);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', async (req, res) => {
  try {
    const post = new Post(req.body);
    await post.save();
    await post.populate('userId');
    res.status(201).json(post);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
