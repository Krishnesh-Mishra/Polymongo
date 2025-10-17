/**
 * User Model Schema
 * Basic user schema for CRUD examples.
 * Fields: name (required), email (required, unique), timestamps.
 */
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true }
}, { timestamps: true });

const UserModel = mongoose.model('User', userSchema)
module.exports = UserModel
