/**
 * PolyMongo Examples Server
 * Entry point for demonstrating PolyMongo features via REST API.
 * Usage: node server.js
 * Endpoints:
 *   - /users: GET/POST users (default DB)
 *   - /posts: GET/POST posts with populate
 *   - /seed/users: POST to seed users
 *   - /seed/posts: POST to seed posts (requires users)
 *   - /examples/basic/multi-db: GET users from default and 'admin' DB
 *   - /examples/basic/status: GET connection status
 *   - /examples/transaction/create-user-post: POST {name, email} for atomic user+post
 *   - /examples/watch/start-watch: GET to start console logging Post changes
 *   - /examples/watch/close-watch: POST to stop watch on 'Polymongo'
 *   - /examples/hooks/setup-hooks: GET to register console log hooks
 *   - /examples/scale/set-db: POST to config 'analytics' pool
 *   - /examples/scale/connect-db: POST to connect 'cache' pool
 *   - /examples/stats/general: GET pool stats
 *   - /examples/stats/db/:name: GET DB stats (e.g., /Polymongo)
 *   - /examples/stats/list-dbs: GET all DBs with sizes
 *   - /examples/bulk-copy/copy/:source/:target: POST (e.g., /Polymongo/backup)
 *   - /examples/bulk-drop/drop/:name: DELETE (e.g., /backup)
 *   - /examples/bulk-export/export/:name: GET JSON export
 *   - /examples/bulk-import/import/:name: POST with export JSON body
 *   - /examples/bulk-stream-export/stream-export/:name: GET streamed JSON
 *   - /examples/bulk-stream-import/stream-import/:name: POST with JSON body as stream
 * Notes: Debug=true logs to console/files. ColdStart=false eager connects primary.
 */
const express = require('express');
const { PolyMongoWrapper } = require('polymongo');
const mongoose = require('mongoose');
const indexRouter = require('./src/routes/index.route');

const app = express();
app.use(express.json());

const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017',
  defaultDB: 'Polymongo',
  coldStart: false,
  debug: true
});

app.locals.wrapper = wrapper;

app.use('/', indexRouter(wrapper));

app.listen(3000, () => console.log('Server running on port 3000'));
