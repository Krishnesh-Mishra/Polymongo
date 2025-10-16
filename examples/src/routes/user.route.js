/**
 * User Routes
 * Basic CRUD for User model on default DB ('Polymongo').
 * Usage: Mount at /users. Requires wrapper in req.
 * GET /users: List all users.
 * POST /users: Create user {name, email}.
 * GET /users/:id: Get user by ID.
 * Notes: Uses wrapped model for potential multi-DB extension.
 */
const express = require('express');
const router = express.Router();
const UserModel = require('../models/User');

router.use((req, res, next) => { req.wrapper = req.app.locals.wrapper; next(); });

router.get('/', async (req, res) => {
  try {
    const users = await req.wrapper.wrapModel(UserModel).find({});
    res.json(users);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', async (req, res) => {
  try {
    const user = new (req.wrapper.wrapModel(UserModel))(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await req.wrapper.wrapModel(UserModel).findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
