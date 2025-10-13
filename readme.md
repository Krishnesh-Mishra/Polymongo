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
const wrapper = new PolyMongo.createWrapper({
  mongoURI: 'mongodb://localhost:27017',
  poolSize: 10,
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


---


### Configuration Examples

```javascript
// Replica set (for change streams)
const wrapper = PolyMongo.createWrapper({
  mongoURI: 'mongodb://localhost:27017?replicaSet=rs0'
});
```

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


## 📚 API Reference

### `PolyMongo.createWrapper(config)`
Creates a new PolyMongo instance.

### `wrapper.wrapModel(model)`
Wraps a Mongoose model for multi-database use.

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

MIT © [Krishnesh Mishra]

---

## 🌟 Show Your Support

If PolyMongo helps your project, give it a ⭐️ on [GitHub](https://github.com/krishnesh-mishra/polymongo)!

---

## 🔗 Links

- [Documentation](https://polymongo.dev/docs)
- [NPM Package](https://www.npmjs.com/package/polymongo)
- [GitHub Repository](https://github.com/krishnesh-mishra/polymongo)
- [Issue Tracker](https://github.com/krishnesh-mishra/polymongo/issues)
- [Changelog](CHANGELOG.md)

---

**Built with ❤️ for the MongoDB community**