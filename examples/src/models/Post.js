/**
 * Post Model Schema
 * Post schema with ref to User for populate examples.
 * Fields: title (required), content, userId (ref: 'User'), timestamps.
 */
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const PostModel = mongoose.model('Post', postSchema)

module.exports = PostModel
