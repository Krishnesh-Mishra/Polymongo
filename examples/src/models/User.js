/**
 * User Model Schema
 * Basic user schema for CRUD examples.
 * Fields: name (required), email (required, unique), timestamps.
 * Usage: In routes, wrap with wrapper.wrapModel(User) for multi-DB support.
 * Example: const User = wrapper.wrapModel(require('./User')); User.db('db').find({});
 */
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
