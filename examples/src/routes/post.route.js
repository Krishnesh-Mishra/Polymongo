/**
 * Post Routes
 * CRUD for Post model with populate on default DB.
 * Usage: Mount at /posts. Supports userId ref.
 * GET /posts: List posts with populated user.
 * POST /posts: Create post {title, content, userId}.
 * Notes: Populate enhances response; extend to multi-DB via .db().
 */
const express = require('express');
const router = express.Router();
const PostModel = require('../models/Post');

router.use((req, res, next) => { req.wrapper = req.app.locals.wrapper; next(); });

router.get('/', async (req, res) => {
  try {
    const posts = await req.wrapper.wrapModel(PostModel).find({}).populate('userId');
    res.json(posts);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', async (req, res) => {
  try {
    const post = new (req.wrapper.wrapModel(PostModel))(req.body);
    await post.save();
    await post.populate('userId');
    res.status(201).json(post);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
