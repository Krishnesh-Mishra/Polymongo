// test/server.js
const express = require('express');
const mongoose = require('mongoose');
const PolyMongo = require('../dist/index.js');

const app = express();
app.use(express.json());


//Create Wrapper Instance using PolyMongo

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

*/
const wrapper = PolyMongo.createWrapper({ mongoURI: 'mongodb://localhost:27017?replicaSet=rs0' , });


//Define Mongoose Schema & Model
const userSchema = new mongoose.Schema({ name: String });
//Wrap Model
const User = wrapper.wrapModel(mongoose.model('User', userSchema));



//Add User to Specific DB
app.post('/add-user', async (req, res) => {
    const { name, db = 'default' } = req.body;
    await User.db(db).create({ name });
    res.send('User added');
});



//Normal Mongoose Query
app.get('/users', async (req, res) => {
    const { db } = req.body;
    const users = await User.db(db).find().limit(2).sort({ name: 1 }).lean();
    res.json(users);
});



//Get Stats
app.get('/stats', (req, res) => {
    res.json(wrapper.connectionManager.getStats());
});





//Streams Supported
app.get('/watch/sm', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const changeStream = User.db('sm').watch();

  changeStream.on('change', change => {
    res.write(`data: ${JSON.stringify(change)}\n\n`);
  });

  req.on('close', () => {
    changeStream.close();
  });
});

app.listen(3000, () => console.log('Server running on port 3000'));