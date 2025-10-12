const express = require('express');
const mongoose = require('mongoose');
const PolyMongo = require('../dist/index.js');

const app = express();
app.use(express.json());

const wrapper = PolyMongo.default.createWrapper({ mongoURI: 'mongodb://localhost:27017' });

const userSchema = new mongoose.Schema({ name: String, });
const User = wrapper.wrapModel(mongoose.model('User', userSchema));

app.post('/add-user', async (req, res) => {
    const { name, db = 'default' } = req.body;
    await User.db(db).create({ name });
    console.log('User Added');
    console.log(wrapper.stats())
    res.send('User added');
});

app.get('/users', async (req, res) => {
    const { db } = req.body;
    const users = await User.db(db).find();
    console.log('Request received at /users');
    console.log(wrapper.connectionManager.getStats());
    res.json(users);
});
app.get('/stats', async (req, res) => {

    console.log(wrapper.stats());
    console.log(wrapper.connectionManager.getStats());
    res.json(wrapper.connectionManager.getStats());
});

app.listen(3000, () => console.log('Server running on port 3000'));