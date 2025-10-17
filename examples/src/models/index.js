/**
 * Models Index
 * Creates and exports PolyMongoWrapper and wrapped Mongoose models.
 * Usage: const { wrapper, User, Post } = require('./models/index');
 * Then: User.find({}); User.db('admin').find({}); wrapper.isConnected();
 */
const PolyMongo = require('../../../dist/index');
const mongoose = require('mongoose');
const UserModel = require('./User');
const PostModel = require('./Post');

const wrapper = PolyMongo.createWrapper({
  mongoURI: 'mongodb://localhost:27017',
  defaultDB: 'Polymongo',
  coldStart: false,
  debug: true
});


const wrappedModels = {
  User: wrapper.wrapModel(UserModel),
  Post: wrapper.wrapModel(PostModel)
};

module.exports = { wrapper, ...wrappedModels };


/*
There is a VERY COMMON Mistake People Import UN-WRAPPED Models from the files like import User from models/User.js hence Naming there is suggested to be UserModel

OR


If You A Migrating from preBuilt code-base me personally recommend exporting this wrapper to User.js and wrapping then Exporting 

const wrapper = require('./index.js')
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true }
}, { timestamps: true });

const User = wrapper.wrapModel(mongoose.model('User', userSchema))
module.exports = User

*/