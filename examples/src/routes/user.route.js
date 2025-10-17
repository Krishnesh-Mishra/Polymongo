/**
 * User Routes
 * Basic CRUD for User model on default DB.
 * GET /users: List all users.
 * POST /users: Create user {name, email}.
 * GET /users/:id: Get user by ID.
 */
const express = require('express');
const router = express.Router();
const { User } = require('../models/index');

router.get('/', async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
