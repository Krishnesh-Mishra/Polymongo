# PolyMongo

**The intelligent multi-database connection manager for MongoDB and Mongoose .**

PolyMongo enables seamless database multiplexing with a single connection pool, perfect for multi-tenant applications, microservices, and dynamic database architectures. Stop managing multiple connection instances—let PolyMongo handle it all.

It Uses Single TCP Connection (optionally multiple) For Multiple Databse & Very PERFORMANCE & DX CENTRIC.

---

## ✨ Features

- **🎯 Single Connection Pool** - One MongoClient connection shared across unlimited databases
- **🔄 Smart Connection Reuse** - Automatic connection caching and lazy initialization
- **📊 Real-time Change Streams** - Built-in watch stream management with automatic cleanup
- **🛡️ Production Ready** - Graceful shutdown, reconnection logic, and error handling
- **🔍 Debug Mode** - Comprehensive logging with Winston integration
- **⚡ Cold Start Support** - Defer connection initialization until first query
- **🔌 Connection Warm-Up** - Always keep N number of free connection so that Query gets Resolved Quickly
- **🚀 Serverless Optimized** - No manual `connect()` in routes—Next.js, Vercel Edge, Lambda ready
- **📈 Connection Stats** - Monitor active connections and pool statistics
- **🎭 Zero Configuration** - Works out of the box with sensible defaults

---

## 📦 Installation

```bash
npm install polymongo
```

---

## 🚀 Quick Start

```javascript
const PolyMongo = require('polymongo');
const mongoose = require('mongoose');

// Create wrapper
const wrapper = PolyMongo.createWrapper({
  mongoURI: 'mongodb://localhost:27017',
  maxPoolSize: 10,
  debug: true
});

// Define and wrap your model
const userSchema = new mongoose.Schema({ name: String, email: String });
const User = wrapper.wrapModel(mongoose.model('User', userSchema));

// Query from different databases
const usersFromDB1 = await User.db('tenant_1').find();
const usersFromDB2 = await User.db('tenant_2').find();
const usersDefault = await User.db().find(); // Uses 'default' database
```

---

## 🚀 Next.js / Serverless Usage

**No more `connect()` in every route!** PolyMongo handles connections automatically.

```typescript
// lib/db.ts - Configure once
import PolyMongo from 'polymongo';
import mongoose from 'mongoose';

export const wrapper = PolyMongo.createWrapper({
  mongoURI: process.env.MONGODB_URI!,
  maxPoolSize: 1,
  coldStart: true // Auto-connects on first query
});

const userSchema = new mongoose.Schema({ name: String, email: String });
export const User = wrapper.wrapModel(mongoose.model('User', userSchema));
```

```typescript
// app/api/users/route.ts
import { User } from '@/lib/db';

export async function GET() {
  // ✅ Just query - no connect() needed!
  const users = await User.find();
  return Response.json(users);
}
```

Works with: Next.js App Router, Vercel Edge Functions, AWS Lambda, Cloudflare Workers

---

## 🎯 Express Server Example

```javascript
const PolyMongo = require('polymongo');
const mongoose = require('mongoose');
const express = require('express');

const app = express();
app.use(express.json());

// Initialize PolyMongo
const wrapper = PolyMongo.createWrapper({
  mongoURI: 'mongodb://localhost:27017',
  maxPoolSize: 10,
  minFreeConnections: 2,
  idleTimeoutMS: 30000,
  debug: true,
  coldStart: true
});

// Define schema and wrap model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = wrapper.wrapModel(mongoose.model('User', userSchema));

// Get users from specific database
app.get('/users', async (req, res) => {
  try {
    const { db = 'default' } = req.query;
    const users = await User.db(db).find().limit(20).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create user in specific database
app.post('/users', async (req, res) => {
  try {
    const { name, email, db = 'default' } = req.body;
    const user = await User.db(db).create({ name, email });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Real-time change stream (SSE)
app.get('/watch/:db', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const changeStream = User.db(req.params.db).watch();
  
  changeStream.on('change', change => {
    res.write(`data: ${JSON.stringify(change)}\n\n`);
  });

  changeStream.on('error', error => {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
  });

  req.on('close', () => {
    changeStream.close();
  });
});

// Connection statistics
app.get('/stats', (req, res) => {
  res.json(wrapper.stats());
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: wrapper.isConnected() ? 'healthy' : 'unhealthy',
    state: wrapper.getConnectionState(),
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handled automatically by PolyMongo
app.listen(3000, () => {
  console.log('Server running on port 3000');
  console.log(`Connection state: ${wrapper.getConnectionState()}`);
});
```

---

## ⚙️ Configuration Options

### `PolyMongoOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mongoURI` | `string` | **required** | MongoDB connection string (supports `mongodb://` and `mongodb+srv://`) |
| `maxPoolSize` | `number` | `10` | Maximum number of connections in the pool |
| `minFreeConnections` | `number` | `0` | Minimum number of idle connections to maintain (used for fast warming up and ccreating N free tcp connection)  |
| `idleTimeoutMS` | `number` | `undefined` | Time in milliseconds before idle connections are closed |
| `debug` | `boolean` | `false` | Enable detailed logging to console and files |
| `coldStart` | `boolean` | `true` | Defer connection initialization until first query |
| `logPath` | `string` | `./logs/Polymongo` | Directory path for log files |

### Configuration Examples

**Development:**
```javascript
const wrapper = PolyMongo.createWrapper({
  mongoURI: 'mongodb://localhost:27017',
  maxPoolSize: 5,
  debug: true,
  coldStart: false // Connect immediately for faster first request
});
```

**Production:**
```javascript
const wrapper = PolyMongo.createWrapper({
  mongoURI: process.env.MONGODB_URI,
  maxPoolSize: 50,
  minFreeConnections: 5,
  idleTimeoutMS: 60000,
  debug: false,
  coldStart: true,
  logPath: '/var/log/polymongo'
});
```

**Serverless (AWS Lambda, Vercel):**
```javascript
const wrapper = PolyMongo.createWrapper({
  mongoURI: process.env.MONGODB_URI,
  maxPoolSize: 1, // Minimize connections for serverless
  minFreeConnections: 0,
  coldStart: true, // Essential for cold starts
  debug: false
});
```

---

## 📁 Production File Structure

Recommended project structure for Express + MongoDB backend:

```
project/
├── src/
│   ├── config/
│   │   ├── database.js          # PolyMongo configuration
│   │   └── env.js               # Environment variables
│   ├── models/
│   │   ├── User.js              # User model definition
│   │   ├── Product.js           # Product model definition
│   │   └── index.js             # Export all wrapped models
│   ├── routes/
│   │   ├── users.js             # User routes
│   │   ├── products.js          # Product routes
│   │   └── index.js             # Route aggregator
│   ├── middleware/
│   │   ├── dbSelector.js        # Database selection middleware
│   │   ├── errorHandler.js      # Error handling
│   │   └── auth.js              # Authentication
│   ├── services/
│   │   ├── userService.js       # Business logic
│   │   └── productService.js
│   ├── utils/
│   │   ├── logger.js            # Custom logging
│   │   └── validators.js        # Input validation
│   └── app.js                   # Express app setup
├── logs/                        # Log files (auto-generated)
├── tests/
├── .env
├── .env.production
└── server.js                    # Entry point
```

### Example Implementation

**`src/config/database.js`**
```javascript
const PolyMongo = require('polymongo');

const wrapper = PolyMongo.createWrapper({
  mongoURI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  maxPoolSize: parseInt(process.env.MAX_POOL_SIZE) || 10,
  minFreeConnections: parseInt(process.env.MIN_FREE_CONNECTIONS) || 2,
  idleTimeoutMS: parseInt(process.env.IDLE_TIMEOUT_MS) || 30000,
  debug: process.env.NODE_ENV !== 'production',
  coldStart: process.env.COLD_START === 'true',
  logPath: process.env.LOG_PATH || './logs/polymongo'
});

module.exports = wrapper;
```

**`src/models/User.js`**
```javascript
const mongoose = require('mongoose');
const wrapper = require('../config/database');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

const BaseUser = mongoose.model('User', userSchema);
const User = wrapper.wrapModel(BaseUser);

module.exports = User;
```

**`src/models/index.js`**
```javascript
module.exports = {
  User: require('./User'),
  Product: require('./Product'),
  Order: require('./Order')
};
```

**`src/middleware/dbSelector.js`**
```javascript
// Middleware to extract database name from request
module.exports = (req, res, next) => {
  // From header
  req.dbName = req.headers['x-tenant-db'] || 
               req.query.db || 
               req.body.db || 
               req.user?.tenantDb || // From auth
               'default';
  
  next();
};
```

**`src/routes/users.js`**
```javascript
const express = require('express');
const router = express.Router();
const { User } = require('../models');
const dbSelector = require('../middleware/dbSelector');

// Apply database selector middleware
router.use(dbSelector);

router.get('/', async (req, res, next) => {
  try {
    const users = await User.db(req.dbName)
      .find()
      .select('-__v')
      .limit(100)
      .lean();
    
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const user = await User.db(req.dbName).create(req.body);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

**`src/app.js`**
```javascript
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const wrapper = require('./config/database');

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: wrapper.isConnected() ? 'healthy' : 'unhealthy',
    state: wrapper.getConnectionState(),
    stats: wrapper.stats(),
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api', routes);

// Error handling
app.use(errorHandler);

module.exports = app;
```

**`server.js`**
```javascript
const app = require('./src/app');
const wrapper = require('./src/config/database');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Connection state: ${wrapper.getConnectionState()}`);
});

// Graceful shutdown handled automatically by PolyMongo
// But you can add additional cleanup here
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
```

**`.env`**
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017
MAX_POOL_SIZE=10
MIN_FREE_CONNECTIONS=2
IDLE_TIMEOUT_MS=30000
COLD_START=false
LOG_PATH=./logs/polymongo
```

---

## 🔧 API Reference

### Main Methods

#### `wrapper.wrapModel(model)`
Wraps a Mongoose model for multi-database access.

```javascript
const User = wrapper.wrapModel(mongoose.model('User', userSchema));
```

Returns a `WrappedModel` with a `db()` method.

#### `Model.db(dbName)`
Returns the model bound to a specific database.

```javascript
const users = await User.db('tenant_1').find();
```

- **Parameter:** `dbName` (string, default: `'default'`)
- **Returns:** Mongoose Model instance

#### `wrapper.stats()`
Get connection statistics.

```javascript
const stats = wrapper.stats();
// {
//   activeConnections: 3,
//   databases: ['default', 'tenant_1', 'tenant_2'],
//   poolStats: {
//     totalConnections: 5,
//     maxPoolSize: 10,
//     minFreeConnections: 2,
//     idleTimeoutMS: 30000
//   }
// }
```

#### `wrapper.isConnected()`
Check if primary connection is active.

```javascript
if (wrapper.isConnected()) {
  console.log('Connected to MongoDB');
}
```

#### `wrapper.getConnectionState()`
Get current connection state.

```javascript
const state = wrapper.getConnectionState();
// Returns: 'connected', 'disconnected', 'connecting', 'disconnecting', 'not initialized'
```

#### `wrapper.closeAll()`
Gracefully close all connections (allows in-flight operations to complete).

```javascript
await wrapper.closeAll();
```

#### `wrapper.forceCloseAll()`
Force close all connections immediately.

```javascript
await wrapper.forceCloseAll();
```

#### `wrapper.closeDBstream(dbName)`
Close all watch streams for a specific database.

```javascript
wrapper.closeDBstream('tenant_1');
```

#### `wrapper.closeAllWatches()`
Close all active watch streams.

```javascript
wrapper.closeAllWatches();
```

#### **☠️** `wrapper.dropDatabase(dbName)`
Drop a database and clean up its connections.

```javascript
await wrapper.dropDatabase('tenant_1');
```

---

## 🏗️ Inner Engineering

### Architecture Overview

PolyMongo uses a three-tier management system:

```
┌─────────────────────────────────────────────────────────┐
│                    PolyMongoWrapper                     │
│                   (Public Interface)                    │
└────────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Connection   │  │    Watch     │  │     Log      │
│   Manager    │  │   Manager    │  │   Manager    │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Connection Manager

**Responsibilities:**
- Maintains a single primary `mongoose.Connection`
- Caches database-specific connections using `useDb()`
- Handles reconnection logic with exponential backoff
- Manages graceful shutdown on SIGINT/SIGTERM/SIGUSR2
- Monitors connection health and ready states

**Key Features:**
- **Lazy Loading:** Connections created only when accessed
- **Connection Pooling:** Single pool shared across all databases
- **Auto-Reconnect:** Up to 5 reconnection attempts with increasing delays
- **Error Handling:** Distinguishes between retryable and fatal errors

```javascript
// Internal flow
getConnection(dbName) → initPrimary() → primary.useDb(dbName) → Cache → Return
```

### Watch Manager

**Responsibilities:**
- Tracks active MongoDB change streams per database
- Automatically marks databases with active watches
- Cleans up streams on close or error events
- Prevents connection premature closure while streams are active

**Stream Lifecycle:**
```javascript
addStream() → Mark database as watched → Stream active
   ↓
Stream.close() / Stream.error → removeStream() → Unmark if no streams left
```

### Log Manager

**Responsibilities:**
- Winston-based structured logging
- Separate files for general logs and errors
- Automatic log rotation (5MB per file, 5 files max)
- Console output in debug mode

**Log Files:**
- `polymongo-{timestamp}.log` - All logs
- `error.log` - Error logs only

### Connection Lifecycle

```
1. Initialization (coldStart = true)
   └─> No connection created yet

2. First Query
   └─> initPrimary() creates mongoose.Connection
   └─> Connection pool established

3. Database Access
   └─> getConnection(dbName) called
   └─> Check cache → Found? Return : Create via useDb()

4. Change Streams
   └─> watch() intercepted by wrapper
   └─> Stream tracked in WatchManager
   └─> Auto-cleanup on close/error

5. Graceful Shutdown
   └─> Close all watch streams
   └─> Close primary connection (allows in-flight operations)
   └─> Clear caches
   └─> Exit process
```

### Error Handling Strategy

**Retryable Errors:**
- Network timeouts
- Server selection failures
- Temporary connection issues

**Non-Retryable Errors:**
- Authentication failures
- Authorization errors
- Invalid connection strings

**Reconnection Logic:**
```
Attempt 1: Retry after 5 seconds
Attempt 2: Retry after 10 seconds
Attempt 3: Retry after 15 seconds
Attempt 4: Retry after 20 seconds
Attempt 5: Retry after 25 seconds
After 5 attempts: Stop trying, log error
```

### Performance Optimizations

1. **Connection Reuse:** Single pool shared across databases
2. **Lazy Initialization:** Connections created on-demand
3. **Caching:** Database connections cached after first access
4. **Efficient Pooling:** Configurable pool sizes per use case
5. **Idle Timeout:** Automatic cleanup of unused connections

### Thread Safety

PolyMongo is designed for Node.js single-threaded environment but handles concurrent requests safely:

- Connection cache uses `Map` with synchronous access
- Mongoose handles connection pool thread safety internally
- Watch streams are isolated per database
- Graceful shutdown uses flags to prevent race conditions

---

## 🤝 Use Cases

### Multi-Tenant SaaS Applications
```javascript
// Each tenant gets their own database
app.use((req, res, next) => {
  req.dbName = `tenant_${req.user.tenantId}`;
  next();
});

const users = await User.db(req.dbName).find();
```

### Microservices Architecture
```javascript
// Different services use different databases
const ordersDB = 'orders_service';
const inventoryDB = 'inventory_service';

const orders = await Order.db(ordersDB).find();
const products = await Product.db(inventoryDB).find();
```

### Development/Testing Environments
```javascript
// Separate databases for dev, test, staging
const dbName = process.env.NODE_ENV; // 'development', 'test', 'staging'
const users = await User.db(dbName).find();
```

### Real-time Change Tracking
```javascript
// Watch multiple tenant databases simultaneously
const tenants = ['tenant_1', 'tenant_2', 'tenant_3'];

tenants.forEach(tenant => {
  const stream = User.db(tenant).watch();
  stream.on('change', change => {
    console.log(`Change in ${tenant}:`, change);
  });
});
```

---

## 📊 Monitoring & Debugging

### Enable Debug Mode
```javascript
const wrapper = PolyMongo.createWrapper({
  mongoURI: 'mongodb://localhost:27017',
  debug: true // Enables console and file logging
});
```

### Monitor Connection Stats
```javascript
setInterval(() => {
  const stats = wrapper.stats();
  console.log('Active connections:', stats.activeConnections);
  console.log('Databases:', stats.databases);
  console.log('Pool usage:', stats.poolStats);
}, 10000);
```

### Health Check Endpoint
```javascript
app.get('/health', (req, res) => {
  const isHealthy = wrapper.isConnected();
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    state: wrapper.getConnectionState(),
    stats: wrapper.stats(),
    timestamp: new Date().toISOString()
  });
});
```

---

## ⚠️ Best Practices

1. **Always use `lean()` for read-only queries** - Improves performance
   ```javascript
   const users = await User.db('tenant_1').find().lean();
   ```

2. **Close watch streams when done** - Prevents connection leaks
   ```javascript
   req.on('close', () => changeStream.close());
   ```

3. **Use environment variables** - Never hardcode connection strings
   ```javascript
   mongoURI: process.env.MONGODB_URI
   ```

4. **Set appropriate pool sizes** - Balance between performance and resources
   - Development: 5-10
   - Production: 20-50
   - Serverless: 1-2

5. **Enable debug mode in development** - Helps troubleshoot issues
   ```javascript
   debug: process.env.NODE_ENV !== 'production'
   ```

6. **Handle errors gracefully** - Always use try-catch
   ```javascript
   try {
     await User.db(dbName).find();
   } catch (error) {
     console.error('Database error:', error.message);
   }
   ```

7. **Monitor connection health** - Implement health checks
8. **Use indexes** - Essential for multi-tenant queries
9. **Implement rate limiting** - Protect against abuse
10. **Regular log rotation** - Prevent disk space issues

---

## 📝 License

MIT

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 🐛 Issues

Found a bug? [Open an issue](https://github.com/krishnesh-mishra/polymongo/issues)

---

## 🙏 Acknowledgments

Built underhood with ❤️ using [Mongoose](https://mongoosejs.com/) and [Winston](https://github.com/winstonjs/winston).

---

**Made with passion for developers who build scalable MongoDB applications.**