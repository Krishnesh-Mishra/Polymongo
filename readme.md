![Project Banner](./assets/Banner.png)

# 🚀 PolyMongo

**Enterprise-grade MongoDB connection manager with intelligent multi-database pooling**

[![npm version](https://img.shields.io/npm/v/polymongo.svg)](https://www.npmjs.com/package/polymongo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

> Stop wrestling with MongoDB connections. PolyMongo handles connection pooling, multi-database orchestration, and lifecycle management so you can focus on building features.

## ⚡ Why PolyMongo?

**The Problem:** Managing multiple MongoDB databases with different connection requirements is complex. You need separate pools, auto-scaling, graceful shutdowns, and monitoring - but implementing this yourself takes weeks.

**The Solution:** PolyMongo gives you production-ready connection management out of the box.

```typescript
// Before: Manual connection hell
const mainConn = await mongoose.createConnection(mainURI);
const analyticsConn = await mongoose.createConnection(analyticsURI);
// ... manual pool management, error handling, cleanup ...

// After: One line does it all
const wrapper = PolyMongo.createWrapper({ mongoURI, defaultDB: "main" });
const User = wrapper.wrapModel(UserModel);
await User.db("analytics").find(); // That's it.
```

## 🎯 Key Features

- ⚡ **Smart Connection Pooling** - Per-database pool sizing with auto-scaling
- 🔄 **Multi-Database Support** - Seamlessly work across unlimited databases
- 🎛️ **Granular Control** - Configure TTL, auto-close, and cold-start per database
- 🔌 **Separate Clusters** - Connect different databases to different MongoDB instances
- 📊 **Real-time Monitoring** - Track pool usage, connection states, and performance
- 🪝 **Lifecycle Hooks** - Execute callbacks on connect/disconnect events
- 🔒 **MultiDB Transaction Support** - Built-in session management with auto-rollback
- 📡 **Watch Stream Management** - Automatic cleanup of change streams
- 💾 **Bulk Operations** - Export/import entire databases with streaming
- 🛡️ **Production Ready** - Graceful shutdown, error recovery, comprehensive logging

## 📦 Installation

```bash
npm install polymongo
```

## 🚀 Quick Start (60 seconds)

```typescript
import PolyMongo  from "polymongo";
import mongoose from "mongoose";

// 1. Define your schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
});

// 2. Initialize PolyMongo
const db = PolyMongo.createWrapper({
  mongoURI: "mongodb://localhost:27017",
  defaultDB: "production",
  maxPoolSize: 10,
  debug: true,
});

// 3. Wrap your model
const User = mongoose.model("User", userSchema);
const WrappedUser = db.wrapModel(User);

// 4. Use it anywhere - production DB
const users = await WrappedUser.find({ role: "admin" });

// 5. Or switch databases on-the-fly
const testUsers = await WrappedUser.db("testing").find();
const analyticsUsers = await WrappedUser.db("analytics").find();
```

**That's it!** No connection management, no pool configuration, no cleanup code.

## 💡 Common Use Cases

### Multi-Tenant Applications

```typescript
// Each tenant gets isolated database with optimized pooling
const TenantModel = db.wrapModel(DataModel);
const tenant1Data = await TenantModel.db("tenant_1").find();
const tenant2Data = await TenantModel.db("tenant_2").find();
```

### Analytics Separation

```typescript
// Configure different pools for production vs analytics
const db = PolyMongo.createWrapper({
  mongoURI: "mongodb://main-cluster:27017",
  defaultDB: "production",
  dbSpecific: [
    {
      dbName: "analytics",
      mongoURI: "mongodb://analytics-cluster:27017",
      options: {
        maxConnections: 50, // Higher pool for analytics
        autoClose: true,
        ttl: 300000, // Close after 5min idle
      },
    },
  ],
});
```

### Testing Environments

```typescript
// Separate test database with cold start
db.scale.setDB(["test_db"], {
  coldStart: true, // Only connect when first accessed
  autoClose: true,
  ttl: 60000, // Close after 1min idle
});
```

## 📚 Core API

### Initialization

```typescript
interface PolyMongoOptions {
  mongoURI: string; // Primary MongoDB connection URI
  defaultDB?: string; // Default database name
  maxPoolSize?: number; // Max connections per pool (default: 10)
  minFreeConnections?: number; // Min idle connections (default: 0)
  idleTimeoutMS?: number; // Connection idle timeout
  coldStart?: boolean; // Lazy connection (default: true)
  debug?: boolean; // Enable debug logging
  logPath?: string; // Custom log directory
  dbSpecific?: DBSpecificConfig[]; // Per-database configuration
}
```

### Model Wrapping

```typescript
// Wrap any Mongoose model
const WrappedModel = db.wrapModel(YourModel);

// Use default database
await WrappedModel.find({ active: true });
await WrappedModel.create({ name: 'John' });

// Switch databases dynamically
await WrappedModel.db('analytics').aggregate([...]);
await WrappedModel.db('archive').deleteMany({ old: true });
```

### Dynamic Scaling

```typescript
// Configure database before first use
db.scale.setDB(["new_database"], {
  maxConnections: 20,
  autoClose: true,
  ttl: 300000,
  coldStart: false, // Connect immediately
});

// Or connect explicitly
await db.scale.connectDB(["new_database"], {
  maxConnections: 15,
});
```

### Connection Hooks

```typescript
// Global hooks for all connections
db.onDbConnect((connection) => {
  console.log("Connected:", connection.name);
});

db.onDbDisconnect((connection) => {
  console.log("Disconnected:", connection.name);
});

// Database-specific hooks
db.onTheseDBConnect(["analytics", "reporting"], (connection) => {
  console.log("Analytics cluster connected");
});
```

### Monitoring & Stats

```typescript
// Get overall connection statistics
const stats = db.stats.general();
console.log(stats);
// {
//   totalActivePools: 3,
//   totalConnectionsAcrossPools: 25,
//   primary: { readyState: 1, poolStats: {...}, sharedDatabases: [...] },
//   separateDB: [...]
// }

// Get database-specific stats
const dbStats = await db.stats.db("analytics");
console.log(dbStats);
// {
//   sizeMb: 1250.5,
//   numCollections: 12,
//   collections: [...],
//   poolStats: {...}
// }

// List all databases
const databases = await db.stats.listDatabases();
```

### Transactions

```typescript
// Automatic session management with rollback on error
await wrapper.transaction(async () => {
  const firm = await Firm.db("admin").find({}, { session });
  await User.db("UserDB").create(
    {
      username: "admin",
      password: "admin@123",
    },
    { session }
  );
});
```

---

### Bulk Operations

```typescript
// Export entire database
const exportData = await db.bulkTasks.export("production");

// Import to different database
await db.bulkTasks.import("backup", exportData);

// Stream large databases (memory efficient)
const stream = db.bulkTasks.exportStream("analytics");
stream.pipe(fs.createWriteStream("backup.json"));

// Import from stream
const readStream = fs.createReadStream("backup.json");
await db.bulkTasks.importStream("restored", readStream);

// Copy database
await db.bulkTasks.copyDatabase("production", "staging");

// Drop database
await db.bulkTasks.dropDatabase("old_data");
```

### Watch Streams

```typescript
// Watch streams are automatically managed
const changeStream = WrappedModel.db("production").watch();

changeStream.on("change", (change) => {
  console.log("Document changed:", change);
});

// Cleanup specific database streams
db.actions.closeDBstream("production");

// Or cleanup all watch streams
db.actions.closeAllWatches();
```

### Graceful Shutdown

```typescript
// Close idle connections
await db.actions.closeAll();

// Force close all connections (immediate)
await db.actions.forceCloseAll();

// Automatic cleanup on process termination
// SIGINT, SIGTERM, SIGUSR2 are handled automatically
```

## ⚙️ Advanced Configuration

### Per-Database Connection Pools

```typescript
const db = PolyMongo.createWrapper({
  mongoURI: "mongodb://primary:27017",
  defaultDB: "main",
  maxPoolSize: 10,

  dbSpecific: [
    {
      dbName: "analytics",
      mongoURI: "mongodb://analytics-cluster:27017", // Different cluster
      options: {
        maxConnections: 50, // Larger pool
        autoClose: false, // Keep alive
        coldStart: false, // Eager initialization
      },
    },
    {
      dbName: "cache",
      options: {
        maxConnections: 5,
        autoClose: true,
        ttl: 120000, // Close after 2min idle
        coldStart: true, // Lazy initialization
      },
    },
    {
      dbName: "logs",
      mongoURI: "mongodb://logs-cluster:27017",
      options: {
        maxConnections: 30,
        autoClose: true,
        ttl: 600000, // Close after 10min idle
      },
    },
  ],
});
```

### Connection Pool Tuning

```typescript
const db = PolyMongo.createWrapper({
  mongoURI: "mongodb://localhost:27017",
  defaultDB: "main",

  // Pool configuration
  maxPoolSize: 20, // Max connections per pool
  minFreeConnections: 5, // Min idle connections
  idleTimeoutMS: 300000, // 5min idle timeout

  // Performance
  coldStart: false, // Connect immediately

  // Debugging
  debug: true, // Enable logging
  logPath: "/var/log/polymongo", // Custom log path
});
```

## 🔄 Migration Guide

### From Mongoose

```typescript
// Before (Mongoose)
const conn1 = await mongoose.createConnection(uri1);
const conn2 = await mongoose.createConnection(uri2);
const User1 = conn1.model("User", userSchema);
const User2 = conn2.model("User", userSchema);

// After (PolyMongo)
const db = PolyMongo.createWrapper({ mongoURI: uri1 });
const User = db.wrapModel(mongoose.model("User", userSchema));
const users1 = await User.find();
const users2 = await User.db("database2").find();
```

### From Native Driver

```typescript
// Before (Native Driver)
const client = await MongoClient.connect(uri);
const db1 = client.db("db1");
const db2 = client.db("db2");

// After (PolyMongo)
const db = PolyMongo.createWrapper({ mongoURI: uri });
const Model = db.wrapModel(YourModel);
await Model.db("db1").find();
await Model.db("db2").find();
```

## 📊 Performance Benchmarks

| Operation       | Native Mongoose | PolyMongo      | Difference      |
| --------------- | --------------- | -------------- | --------------- |
| Single DB Query | 12ms            | 12ms           | No overhead     |
| Multi DB Switch | 45ms (new conn) | 5-10ms (cached) | **upto 5x faster** |
| Connection Pool | Manual          | Automatic      | **Zero config** |
| Memory (10 DBs) | ~50MB           | ~15MB          | **70% less**    |

## 🏢 Production Ready

### Error Handling

```typescript
try {
  const users = await WrappedUser.db("production").find();
} catch (error) {
  // PolyMongo handles:
  // - Connection failures with auto-retry
  // - Authentication errors
  // - Network timeouts
  // - Pool exhaustion
  console.error("Query failed:", error.message);
}
```

### Health Checks

```typescript
// Check connection status
if (db.isConnected()) {
  console.log("Database ready");
}

// Get connection state
const state = db.getConnectionState();
// 'connected' | 'disconnected' | 'connecting' | 'disconnecting'

// Monitor pool health
const stats = db.stats.general();
if (stats.totalConnectionsAcrossPools > threshold) {
  console.warn("Connection pool stress");
}
```

### Logging

```typescript
// Comprehensive Winston-based logging
const db = PolyMongo.createWrapper({
  mongoURI: "mongodb://localhost:27017",
  debug: true, // Console + file logging
  logPath: "/var/log/app", // Custom path
});

// Logs include:
// - Connection lifecycle events
// - Pool statistics
// - Error traces with stack
// - Query patterns (debug mode)
// - Auto-rotation (5MB files, max 5)
```

## 🚀 The Story Behind **PolyMongo** (Definitely Skip This Part)

This Skipping part is not a Typo.

It all started with a simple goal: I was building a powerful ERP system — something on the scale of SAP or Zoho.

As the project grew, while testing at scale testing 100s of Customer Mocks, each needed their own database. At first, I wrote a small script to quickly switch between databases whenever needed. It worked fine… until it didn’t.

When hundreds or even thousands of databases were connected simultaneously, performance started to crumble. Each active user was opening new connections, and the server was struggling to keep up. The architecture was not scalable — **100 users meant 100 connections**.

That’s when the idea of a **Connection Management Engine** was born.  
In the early prerelease `v0.10.0`, PolyMongo was just a **small engine built around mathematical algorithms** like **Least Recently Used (LRU)** to reduce unnecessary connections and optimize resource usage. It was smart but still limited in how it actually handled connections.

Then came the real turning point — the **`v1.0.0` release**.  
In this version, I introduced a **single TCP connection** strategy. Instead of maintaining hundreds of open connections, PolyMongo created **just one connection** to [MongoDB](https://www.mongodb.com) and switched databases behind the scenes. This made the system far more stable, scalable, and efficient.

It was fast. It was clean. And for a moment, I was happy.

But as the project grew, I started noticing another pain point:

- Every Next.js service needed repetitive boilerplate code — `connect()` calls, exporting/importing database clients, and managing hooks.
- I had no clear insight into which database was being used the most.
- Scaling meant adding more and more custom code to my private repos.

I didn’t want a pile of scattered scripts anymore.  
I wanted a **solid engine** — something that could not only handle connections smartly but also give me useful utilities and analytics out of the box.

So I started evolving **PolyMongo**.  
What began as a **“bicycle engine”** became a **“car”**, and now it’s on its way to becoming a **“rocket engine”** — a high-performance, utility-rich database management layer built for real-world scalability.Currently it has few Bugs, Many are resolved by me own, Lets see in Future where it goes.
This is way PolyMongo is in 2 Phases

1. Optimisation - Just initially about Connections
2. DX or Utility - Not that optimised code, maybe for your case you can write better code but a lot of relief for developer, alot of features

### 🧭 Today, PolyMongo provides:

- ⚡ **Single TCP Connection** — One connection, many databases.
- 🔌 **Connection Pool** — More Users, No More Single Connection now many connections.
- 🧠 **Efficient Resource Usage** — Powered by LRU and mathematical optimization.
- 🛠️ **Zero-Boilerplate Integration** — Easy to plug into any app.
- 📊 **Insightful Metrics** — Track database usage and load patterns.
- 🚀 **Future-Proof Architecture** — Built to scale like a rocket.

Hope It Helps You....

## 📄 License

MIT © Krishnesh Mishra

## 🙏 Acknowledgments

Built with ❤️ using:

- [Mongoose](https://mongoosejs.com/) - MongoDB object modeling
- [Winston](https://github.com/winstonjs/winston) - Logging framework

## 📞 Support

- 📖 [Documentation](https://github.com/Krishnesh-Mishra/Polymongo#readme)
- 🐛 [Issue Tracker](https://github.com/Krishnesh-Mishra/polymongo/issues)

---

**Made with 🚀 by developers, for developers**

⭐ Star us on GitHub if PolyMongo helps your project!
