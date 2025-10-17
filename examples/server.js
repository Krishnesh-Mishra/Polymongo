/**
 * PolyMongo Examples Server
 * Minimal entry point.
 * Usage: node server.js
 */
const express = require('express');
const indexRouter = require('./src/routes/index.route');

const app = express();
app.use(express.json());
app.use('/', indexRouter);

app.listen(3000, () => console.log('Server running on port 3000'));
