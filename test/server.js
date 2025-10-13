// test/server.js
const express = require('express');
const mongoose = require('mongoose');
const PolyMongo = require('../dist/index.js');

const app = express();
app.use(express.json());

const wrapper = PolyMongo.default.createWrapper({ mongoURI: 'mongodb://localhost:27017?replicaSet=rs0' , });

const userSchema = new mongoose.Schema({ name: String });
const User = wrapper.wrapModel(mongoose.model('User', userSchema));

app.post('/add-user', async (req, res) => {
    const { name, db = 'default' } = req.body;
    await User.db(db).create({ name });
    res.send('User added');
});

app.get('/users', async (req, res) => {
    const { db } = req.body;
    const users = await User.db(db).find().limit(2).sort({ name: 1 }).lean();
    res.json(users);
});

app.get('/stats', (req, res) => {
    res.json(wrapper.connectionManager.getStats());
});

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