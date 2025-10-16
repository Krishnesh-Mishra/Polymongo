/**
 * Post Model Schema
 * Post schema with ref to User for populate examples.
 * Fields: title (required), content, userId (ref: 'User'), timestamps.
 * Usage: Populate in queries: .populate('userId'). Supports watch streams.
 * Example: Post.db('Polymongo').watch() for change detection.
 */
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);
