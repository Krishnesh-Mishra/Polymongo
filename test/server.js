// test/server.js
const express = require('express');
const mongoose = require('mongoose');
const PolyMongo = require('../dist/index.js');

const app = express();
app.use(express.json());

// Create wrapper with single MongoClient
const wrapper = new PolyMongo.createWrapper({
  mongoURI: 'mongodb://localhost:27017',
  poolSize: 10,
  minFreeConnections: 1,
  maxPoolSize: 1,
  idleTimeoutMS:30000,
  debug:true
});

// Define schema and wrap model
const userSchema = new mongoose.Schema({ name: String });
const User = wrapper.wrapModel(mongoose.model('User', userSchema));


/* 
For Production:
    Models/index.js
    -------------------
    1. Create a single PolyMongo wrapper instance.
    2. Wrap all your mongoose models using this instance.
    3. Export the wrapped models for use in your application.

    Example:

    1. Create Wrapper Instance
    -------------------
    const wrapper = PolyMongo.createWrapper({ 
        mongoURI: 'your-mongodb-uri', 
        metadataDB: 'polymongo_metadata', // Optional, defaults to 'polymongo_metadata'
        idleTimeout: 300000, // Optional, in milliseconds, defaults to 300000 (5 minutes)
    });

    2. Wrap Models
    -------------------
    import User from './User';
    import Product from './Product';
    const WrappedUser = wrapper.wrapModel(User);
    const WrappedProduct = wrapper.wrapModel(Product);

    3. Export Wrapped Models
    -------------------
    module.exports = { WrappedUser, WrappedProduct };


    This Way you can easily adapt your existing mongoose models to use multiple databases with minimal changes.
*/



// Query from specific database
app.get('/users', async (req, res) => {
  const { db } = req.body;
  for (let i = 0; i < 1000; i++) {
    await User.db(`test-${i}`).find()
  }
  const users = await User.db(db).find().limit(20).sort({ name: -1 }).lean();
  res.json(users);
});
app.get('/stats', async (req, res) => {
  res.json(wrapper.stats());
});


// Add user to specific database
app.post('/add-user', async (req, res) => {
  const { name, db = 'default' } = req.body;
  await User.db(db).create({ name });
  res.send('User added');
});

// Watch changes (connection stays open)
app.get('/watch/:db', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const changeStream = User.db(req.params.db).watch();

  changeStream.on('change', change => {
    res.write(`data: ${JSON.stringify(change)}\n\n`);
  });

  req.on('close', () => {
    changeStream.close();
  });
});

app.listen(3000, () => console.log('Server running on port 3000'));