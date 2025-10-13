# 🚀 PolyMongo

**The intelligent multi-database connection manager for Mongoose**

PolyMongo seamlessly manages hundreds of MongoDB database connections with automatic eviction, smart prioritization, and zero configuration overhead. Perfect for multi-tenant applications, SaaS platforms, and microservices architectures.

[![npm version](https://img.shields.io/npm/v/polymongo.svg)](https://www.npmjs.com/package/polymongo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

---

## ✨ Why PolyMongo?

Managing multiple database connections in Mongoose is painful. PolyMongo solves this by:

- **🎯 Zero Boilerplate** - Use one model across unlimited databases with `.db(name)`
- **🧠 Intelligent Eviction** - Automatically closes idle connections based on usage patterns
- **⚡ Automatic Optimization** - Learns which databases are accessed most frequently
- **🔒 Connection Pooling** - Configurable limits prevent resource exhaustion
- **📊 Built-in Analytics** - Real-time connection statistics and health monitoring
- **🎪 Change Streams Support** - Protected connections that never auto-evict
- **🔧 Drop-in Replacement** - Works with existing Mongoose models

---

## 📦 Installation

```bash
npm install polymongo
```

**Requirements:** MongoDB with replica set (for change streams) or standalone

---

## 🎬 Quick Start

```javascript
const PolyMongo = require('polymongo');
const mongoose = require('mongoose');

// 1. Create wrapper
const wrapper = PolyMongo.createWrapper({
  mongoURI: 'mongodb://localhost:27017',
  maxConnections: 100,        // Optional: limit concurrent connections
  idleTimeout: 600000,        // Optional: close after 10min idle (default)
  metadataDB: 'polymongo-meta' // Optional: metadata storage
});

// 2. Define your schema once
const userSchema = new mongoose.Schema({
  name: String,
  email: String
});

// 3. Wrap the model
const User = wrapper.wrapModel(mongoose.model('User', userSchema));

// 4. Use across any database!
await User.db('tenant-acme').create({ name: 'Alice' });
await User.db('tenant-beta').create({ name: 'Bob' });

const acmeUsers = await User.db('tenant-acme').find();
const betaUsers = await User.db('tenant-beta').find();
```

That's it! PolyMongo handles all connection lifecycle management automatically.

---

## 🌟 Core Features

### Multi-Database Operations

```javascript
// Each tenant gets isolated data
app.post('/users', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'];
  const user = await User.db(tenantId).create(req.body);
  res.json(user);
});

// Query any database on demand
const allTenants = ['acme', 'beta', 'gamma'];
const reports = await Promise.all(
  allTenants.map(tenant => 
    User.db(tenant).countDocuments()
  )
);
```

### Full Mongoose API Support

```javascript
// All Mongoose methods work seamlessly
await User.db('tenant-1')
  .find({ active: true })
  .populate('orders')
  .sort({ createdAt: -1 })
  .limit(10)
  .lean()
  .exec();

// Aggregations
const stats = await User.db('tenant-1').aggregate([
  { $match: { active: true } },
  { $group: { _id: '$country', count: { $sum: 1 } } }
]);

// Transactions
const session = await User.db('tenant-1').startSession();
await session.withTransaction(async () => {
  await User.db('tenant-1').create([{ name: 'Alice' }], { session });
});
```

### Change Streams (Never Evicted)

```javascript
// Connections with active change streams are protected
const changeStream = User.db('realtime-feed').watch();

changeStream.on('change', (change) => {
  console.log('Database changed:', change);
});

// This connection will NEVER be auto-closed
// Even if maxConnections is reached
```

### Priority Management

```javascript
// Set high priority for critical databases
await wrapper.setPriority('production-main', -1); // Never evict
await wrapper.setPriority('analytics', 5);      // High priority
await wrapper.setPriority('archives', 150);        // Low priority (evict first)

// Priority affects eviction decisions:
// -1: Never evicted (reserved for critical DBs)
// Lower numbers = higher priority = evicted last
```

### Connection Statistics

```javascript
const stats = wrapper.stats();
// Returns detailed metrics for each connection:
[
  {
    dbName: 'tenant-acme',
    priority: 100,
    useCount: 450,           // Total operations
    avgInterval: 5000,       // Avg ms between operations
    lastUsed: 1697123456789, // Timestamp
    idleTime: 30000,         // Current idle time (ms)
    hasWatch: false,         // Change stream active?
    score: 85.3              // Eviction score (higher = keep)
  }
]
```

### Manual Connection Control

```javascript
// Pre-open connections (useful for warmup)
await wrapper.openConnection('frequently-used-db');

// Manually close when done
await wrapper.closeConnection('rarely-used-db');

// Clean shutdown
await wrapper.destroy();
```

---

## 🎯 Advanced Usage

### Express Multi-Tenant API

```javascript
const express = require('express');
const app = express();

// Tenant middleware
app.use((req, res, next) => {
  req.tenantId = req.headers['x-tenant-id'] || 'default';
  next();
});

// CRUD endpoints work across all tenants
app.get('/users', async (req, res) => {
  const users = await User.db(req.tenantId).find();
  res.json(users);
});

app.post('/users', async (req, res) => {
  const user = await User.db(req.tenantId).create(req.body);
  res.json(user);
});

// Admin endpoint: stats for all connections
app.get('/admin/connections', (req, res) => {
  res.json(wrapper.stats());
});
```

### Real-Time Data Sync

```javascript
// WebSocket-based real-time updates
io.on('connection', (socket) => {
  const tenantId = socket.handshake.auth.tenantId;
  
  const changeStream = User.db(tenantId).watch();
  
  changeStream.on('change', (change) => {
    socket.emit('data-changed', change);
  });
  
  socket.on('disconnect', () => {
    changeStream.close();
  });
});
```

### Dynamic Schema Per Tenant

```javascript
// Different models for different databases
const createTenantModel = (tenantId) => {
  const schema = new mongoose.Schema({
    name: String,
    // Add tenant-specific fields
    customFields: tenantConfig[tenantId].fields
  });
  
  return wrapper.wrapModel(
    mongoose.model(`User_${tenantId}`, schema)
  );
};
```

### Health Monitoring

```javascript
// Monitor connection health
setInterval(() => {
  const stats = wrapper.stats();
  
  stats.forEach(stat => {
    if (stat.idleTime > 300000) { // 5 min idle
      console.warn(`Database ${stat.dbName} has been idle`);
    }
    
    if (stat.useCount > 10000) {
      console.log(`High usage: ${stat.dbName} - ${stat.useCount} ops`);
    }
  });
}, 60000);
```

---

## 🔧 Configuration

```typescript
interface PolyMongoConfig {
  mongoURI: string;           // Required: Base MongoDB connection string
  maxConnections?: number;    // Optional: Max concurrent connections (default: unlimited)
  idleTimeout?: number;       // Optional: Close idle connections after ms (default: 600000)
  metadataDB?: string;        // Optional: DB for storing metadata (default: 'polymongo-metadata')
  defaultDB?: string;         // Optional: Default database name (default: 'Default-DB')
}
```

### Configuration Examples

```javascript
// Minimal setup
const wrapper = PolyMongo.createWrapper({
  mongoURI: 'mongodb://localhost:27017'
});

// Production setup
const wrapper = PolyMongo.createWrapper({
  mongoURI: 'mongodb://user:pass@cluster.mongodb.net',
  maxConnections: 50,      // Limit to 50 concurrent DBs
  idleTimeout: 300000,     // Close after 5min idle
  metadataDB: 'app-meta',  // Custom metadata location
  defaultDB: 'app-default' // Default DB for .db() without args
});

// Replica set (for change streams)
const wrapper = PolyMongo.createWrapper({
  mongoURI: 'mongodb://localhost:27017?replicaSet=rs0'
});
```

---

## 📊 How It Works

### Smart Eviction Algorithm

When `maxConnections` is reached, PolyMongo calculates a **score** for each connection:

```
score = (useCount × 10 / avgInterval) - (idleTime × 0.001) + (-priority)
```

- **Higher useCount** = Higher score (keep busy connections)
- **Lower avgInterval** = Higher score (keep frequently used)
- **Higher idleTime** = Lower score (evict idle first)
- **Higher priority** = Higher score (evict low priority first)

**Protected connections** (never evicted):
- Priority set to `-1`
- Active change streams (`hasWatch: true`)

### Connection Lifecycle

```
┌─────────────────┐
│  First Access   │
│  User.db('X')   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│ Create Conn     │─────▶│ Store Stats  │
│ Store Metadata  │      │ Start Timer  │
└────────┬────────┘      └──────────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│ Operations...   │─────▶│ Update Stats │
│ find/create/etc │      │ Reset Idle   │
└────────┬────────┘      └──────────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│ Idle Timeout    │─────▶│ Auto Close   │
│ OR Max Reached  │      │ Free Memory  │
└─────────────────┘      └──────────────┘
```

---

## 🚀 Performance Tips

1. **Set appropriate `maxConnections`** - Balance memory vs availability
2. **Use priority for critical databases** - Prevent important connections from closing
3. **Tune `idleTimeout`** - Shorter = less memory, but more reconnections
4. **Monitor stats regularly** - Identify usage patterns and optimize
5. **Pre-open hot databases** - Use `openConnection()` during startup
6. **Close when done** - Call `destroy()` on app shutdown

---

## 🆚 Comparison

| Feature | PolyMongo | Native Mongoose | Other Libraries |
|---------|-----------|-----------------|-----------------|
| Multi-DB Support | ✅ One line | ❌ Manual management | ⚠️ Limited |
| Auto Eviction | ✅ Smart algorithm | ❌ Manual | ❌ None |
| Change Streams | ✅ Protected | ✅ Manual | ⚠️ Varies |
| Connection Limits | ✅ Configurable | ❌ Manual | ⚠️ Basic |
| Usage Analytics | ✅ Built-in | ❌ None | ❌ None |
| Priority System | ✅ Yes | ❌ No | ❌ No |
| TypeScript | ✅ Full support | ✅ Yes | ⚠️ Varies |
| Drop-in Compatible | ✅ Yes | N/A | ❌ No |

---

## 🎓 Use Cases

### Multi-Tenant SaaS
```javascript
// Each customer gets isolated database
app.use((req, res, next) => {
  req.db = User.db(req.customer.id);
  next();
});
``` 

### Multi-Region
```javascript
// Different services access different DBs
const orders_ind = Order.db('orders-ind');
const orders_eu = Order.db('orders-eq');
const orders_usa = Order.db('orders-usa');
```

### Microservices
```javascript
// Different services access different DBs
const orders = Order.db('orders-service');
const payments = Payment.db('payments-service');
const notifications = Notification.db('notifications-service');
```

### Sharding Strategy
```javascript
// Distribute users across shards
const shardId = userId % 10;
const user = await User.db(`shard-${shardId}`).findById(userId);
```

### Data Migration
```javascript
// Copy data between databases
const oldData = await User.db('legacy-db').find();
await User.db('new-db').insertMany(oldData);
```

### A/B Testing
```javascript
// Separate databases for experiments
const dbName = experiment.group === 'A' ? 'experiment-a' : 'experiment-b';
await User.db(dbName).create(userData);
```

---

## 🐛 Troubleshooting

### Connection errors?
- Ensure MongoDB is running and accessible
- Check `mongoURI` format: `mongodb://host:port`
- For change streams, use replica set: `?replicaSet=rs0`

### Memory issues?
- Set `maxConnections` lower
- Reduce `idleTimeout` for faster cleanup
- Check stats to identify problematic databases

### Connections not closing?
- Verify no active change streams
- Check priority settings (avoid too many `-1`)
- Ensure operations complete (no hanging queries)

---

## 📚 API Reference

### `PolyMongo.createWrapper(config)`
Creates a new PolyMongo instance.

### `wrapper.wrapModel(model)`
Wraps a Mongoose model for multi-database use.

### `Model.db(dbName)`
Returns model instance for specified database.

### `wrapper.stats()`
Returns array of connection statistics.

### `wrapper.setPriority(dbName, priority)`
Sets eviction priority for a database.

### `wrapper.openConnection(dbName)`
Manually opens a connection.

### `wrapper.closeConnection(dbName)`
Manually closes a connection.

### `wrapper.destroy()`
Closes all connections and cleans up.

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📝 License

MIT © [Your Name]

---

## 🌟 Show Your Support

If PolyMongo helps your project, give it a ⭐️ on [GitHub](https://github.com/yourusername/polymongo)!

---

## 🔗 Links

- [Documentation](https://polymongo.dev/docs)
- [NPM Package](https://www.npmjs.com/package/polymongo)
- [GitHub Repository](https://github.com/yourusername/polymongo)
- [Issue Tracker](https://github.com/yourusername/polymongo/issues)
- [Changelog](CHANGELOG.md)

---

**Built with ❤️ for the MongoDB community**