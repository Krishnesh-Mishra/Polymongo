# PolyMongo

Advanced Multi-Database MongoDB Connection Manager for Node.js with intelligent pooling and auto-scaling.

[![NPM Version](https://img.shields.io/npm/v/polymongo.svg)](https://www.npmjs.com/package/polymongo)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## Installation

```bash
npm install polymongo mongoose
```

## Quick Start

```typescript
import { PolyMongoWrapper } from 'polymongo';
import mongoose from 'mongoose';

const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017',
  defaultDB: 'myapp',
  coldStart: false
});

const userSchema = new mongoose.Schema({ name: String, email: String });
const User = wrapper.wrapModel(mongoose.model('User', userSchema));

// Default database
const users = await User.find({});

// Specific database
const adminUsers = await User.db('admin').find({});
```

---

## Features

### 1. Multi-Database Management

Switch between databases seamlessly without managing multiple connections.

```typescript
const User = wrapper.wrapModel(UserModel);

// Different databases, same model
await User.db('production').find({});
await User.db('staging').find({});
await User.db('analytics').create({ name: 'John' });
```

**Notes:**
- Primary connection shares pool across all databases using `useDb()`
- Each database gets isolated connection context
- No need to redefine models for each database
- Automatic connection caching per database

### 2. Separate Connection Pools

Create isolated connection pools for specific databases with independent configurations.

```typescript
// Method 1: Configuration at initialization
const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017',
  dbSpecific: [
    {
      dbName: 'analytics',
      mongoURI: 'mongodb://analytics-cluster:27017', // Different cluster
      options: {
        maxConnections: 20,
        coldStart: false
      }
    }
  ]
});

// Method 2: Runtime configuration
wrapper.scale.setDB(['reports'], {
  maxConnections: 15,
  autoClose: true,
  ttl: 300000
});

// Method 3: Immediate connection
await wrapper.scale.connectDB(['cache'], {
  maxConnections: 5,
  mongoURI: 'mongodb://cache-server:27017'
});
```

**Notes:**
- Separate pools don't share connections with primary
- Each pool has independent maxPoolSize and minPoolSize
- Can connect to different MongoDB clusters/URIs
- Useful for isolating heavy workloads (analytics, reporting)
- `setDB` saves config but delays connection (lazy)
- `connectDB` establishes connection immediately

### 3. Cold Start & Lazy Loading

Control when connections initialize to optimize startup time.

```typescript
// Global cold start
const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017',
  coldStart: true // Default: connections created on first query
});

// Per-database cold start
const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017',
  coldStart: false, // Primary connects immediately
  dbSpecific: [
    {
      dbName: 'sessions',
      options: {
        coldStart: true // Lazy load this database
      }
    },
    {
      dbName: 'users',
      options: {
        coldStart: false // Eager load this database
      }
    }
  ]
});
```

**Notes:**
- `coldStart: true` - Connection created on first database access
- `coldStart: false` - Connection established during initialization
- Reduces app startup time in serverless/lambda environments
- Per-database control overrides global setting
- Primary connection follows global coldStart setting

### 4. Auto-Close & TTL

Automatically close idle connections to conserve resources.

```typescript
wrapper.scale.setDB(['temp_data'], {
  autoClose: true,
  ttl: 600000, // 10 minutes in milliseconds
  maxConnections: 5
});

// Connection opens on first access
await User.db('temp_data').find({});

// Connection auto-closes after 10 minutes of inactivity
// Timer resets on each query
```

**Notes:**
- Only works with separate connection pools (via `scale.setDB` or `scale.connectDB`)
- Timer resets on every database access
- Gracefully closes connections without dropping active operations
- Ideal for sporadic workloads (reporting, batch jobs)
- TTL is in milliseconds
- Cleared timers prevent memory leaks

### 5. Connection Statistics

Monitor connection health and pool usage in real-time.

```typescript
// General connection stats
const stats = wrapper.stats.general();
console.log(stats);
/*
{
  totalActivePools: 3,
  totalConnectionsAcrossPools: 25,
  primary: {
    readyState: 1,
    poolStats: {
      totalConnections: 10,
      availableConnections: 8,
      inUseConnections: 2,
      waitQueueSize: 0,
      maxPoolSize: 10,
      minPoolSize: 0
    },
    sharedDatabases: ['main', 'users', 'products']
  },
  separateDB: [
    {
      dbName: 'analytics',
      mongoURI: 'mongodb://analytics:27017',
      readyState: 1,
      lastAccessed: 1698765432100,
      isInitialized: true,
      poolStats: { ... }
    }
  ]
}
*/

// Database-specific stats
const dbStats = await wrapper.stats.db('analytics');
console.log(dbStats);
/*
{
  sizeMb: 245.67,
  numCollections: 8,
  collections: [
    { name: 'events', docCount: 1500000, sizeMb: 180.23 },
    { name: 'metrics', docCount: 50000, sizeMb: 65.44 }
  ],
  lastUsed: Date,
  mongoURI: 'mongodb://analytics:27017',
  isInitialized: true,
  config: { maxConnections: 20, autoClose: false },
  poolStats: { ... }
}
*/

// List all databases
const databases = await wrapper.stats.listDatabases();
console.log(databases);
/*
[
  { dbName: 'admin', sizeInMB: 0.00 },
  { dbName: 'main', sizeInMB: 125.45 },
  { dbName: 'analytics', sizeInMB: 245.67 }
]
*/
```

**Notes:**
- `readyState`: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
- Pool stats reflect real-time MongoDB driver metrics
- Database stats create temporary connection if operation exceeds 500ms
- Collection stats use `estimatedDocumentCount` for performance
- Helpful for monitoring, debugging, and capacity planning

### 6. Hook System

Execute callbacks on connection lifecycle events.

```typescript
const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017',
  defaultDB: 'myapp'
});

// Global hooks - trigger for any database
wrapper.onDbConnect((connection) => {
  console.log(`Connected to: ${connection.name}`);
});

wrapper.onDbDisconnect((connection) => {
  console.log(`Disconnected from: ${connection.name}`);
});

// Specific database hooks
wrapper.onTheseDBConnect(['analytics', 'reports'], (connection) => {
  console.log(`Analytics DB connected: ${connection.name}`);
  // Initialize indexes, warm caches, etc.
});

wrapper.onTheseDBDisconnect(['cache'], (connection) => {
  console.log(`Cache DB disconnected`);
  // Cleanup, logging, alerts
});
```

**Notes:**
- Hooks execute for both primary and separate connections
- Multiple callbacks can be registered for same event
- `onDbConnect` fires after successful connection establishment
- `onDbDisconnect` fires before connection closes
- Useful for logging, monitoring, initialization tasks
- Specific hooks (`onTheseDB*`) take precedence but don't prevent global hooks

### 7. Transaction Support

Built-in transaction management with proper session handling.

```typescript
const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017'
});

const result = await wrapper.transaction(async (session) => {
  await User.create([{ name: 'Alice' }], { session });
  await Order.create([{ user: 'Alice', amount: 100 }], { session });
  return { success: true };
});

// With options
await wrapper.transaction(
  async (session) => {
    // Your transactional operations
  },
  {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
    readPreference: 'primary'
  }
);
```

**Notes:**
- Uses primary connection for transactions
- Auto-commits on success, auto-aborts on error
- Session automatically cleaned up after completion
- Requires MongoDB replica set or sharded cluster
- Pass `session` to all operations within transaction
- Supports MongoDB transaction options (readConcern, writeConcern)

### 8. Watch Streams (Change Streams)

Enhanced MongoDB change stream management with automatic cleanup.

```typescript
const User = wrapper.wrapModel(UserModel);

// Watch specific database
const changeStream = User.db('production').watch();

changeStream.on('change', (change) => {
  console.log('Change detected:', change);
});

changeStream.on('error', (error) => {
  console.error('Stream error:', error);
});

// Close specific database streams
wrapper.actions.closeDBstream('production');

// Close all watch streams
wrapper.actions.closeAllWatches();
```

**Notes:**
- Streams automatically tracked per database
- Auto-cleanup on stream close/error
- Prevents connection leaks from abandoned streams
- `closeDBstream` closes all streams for a database
- Streams closed automatically on `closeAll` or `forceCloseAll`
- Works with both primary and separate connections

### 9. Bulk Operations

Comprehensive database-level operations for migrations and backups.

#### Copy Database
```typescript
await wrapper.bulkTasks.copyDatabase('production', 'backup');
```
- Copies all collections and documents
- Preserves indexes (except _id_)
- Waits for connections to be ready
- Source and target can be different connection pools

#### Drop Database
```typescript
await wrapper.bulkTasks.dropDatabase('old_temp_db');
```
- Completely removes database
- Clears connection cache
- Closes associated watch streams
- Cannot be undone

#### Export Database
```typescript
const data = await wrapper.bulkTasks.export('production');
console.log(data);
/*
{
  database: 'production',
  exportDate: '2024-10-17T10:30:00.000Z',
  collections: {
    users: {
      documents: [ { _id: ..., name: 'John' }, ... ],
      indexes: [ { key: { email: 1 }, unique: true }, ... ]
    },
    orders: { ... }
  }
}
*/

// Save to file
const fs = require('fs');
fs.writeFileSync('backup.json', JSON.stringify(data));
```

#### Import Database
```typescript
const data = JSON.parse(fs.readFileSync('backup.json', 'utf8'));
await wrapper.bulkTasks.import('restored_db', data);
```
- Creates collections if they don't exist
- Inserts all documents
- Recreates indexes (except _id_)
- Validates data format before import

#### Export Stream (Memory Efficient)
```typescript
const stream = wrapper.bulkTasks.exportStream('large_database');
const writeStream = fs.createWriteStream('backup.json');

stream.pipe(writeStream);

writeStream.on('finish', () => {
  console.log('Export completed');
});
```
- Streams data without loading entire database into memory
- JSON format, progressively written
- Ideal for large databases (GB+ size)
- Lower memory footprint

#### Import Stream
```typescript
const readStream = fs.createReadStream('backup.json');
await wrapper.bulkTasks.importStream('restored_db', readStream);
```
- Processes data in chunks (1000 docs per batch)
- Memory efficient for large imports
- Validates JSON format
- Handles errors gracefully

**Notes:**
- All operations wait for connections to be ready
- Bulk operations use direct MongoDB driver methods
- Export/import preserve MongoDB ObjectId and types
- Stream operations better for databases >100MB
- Copy operation doesn't overwrite existing data
- Import creates collections automatically

### 10. Connection Management

Graceful shutdown and connection control.

```typescript
// Check connection status
const isConnected = wrapper.isConnected(); // boolean
const state = wrapper.getConnectionState(); // 'connected' | 'disconnected' | ...

// Graceful close (waits for operations to complete)
await wrapper.actions.closeAll();

// Force close (immediate, may interrupt operations)
await wrapper.actions.forceCloseAll();
```

**Notes:**
- `closeAll` closes primary connection gracefully
- `forceCloseAll` closes all connections (primary + separate) immediately
- Automatic graceful shutdown on SIGINT, SIGTERM, SIGUSR2
- Watch streams closed before connections
- `isShuttingDown` flag prevents new operations during shutdown
- Separate connections auto-close based on TTL if configured

### 11. Advanced Pool Configuration

Fine-tune connection behavior per database.

```typescript
const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017',
  maxPoolSize: 10,          // Max connections in primary pool
  minFreeConnections: 2,    // Minimum idle connections maintained
  idleTimeoutMS: 60000,     // Close idle connections after 60s
  debug: true,              // Enable detailed logging
  logPath: './logs/custom', // Custom log directory
  dbSpecific: [
    {
      dbName: 'high_traffic',
      options: {
        maxConnections: 50,  // Larger pool for high traffic
        coldStart: false
      }
    },
    {
      dbName: 'batch_jobs',
      mongoURI: 'mongodb://batch-server:27017',
      options: {
        maxConnections: 5,
        autoClose: true,
        ttl: 900000 // 15 minutes
      }
    }
  ]
});
```

**Notes:**
- `maxPoolSize` applies to primary connection only
- Separate connections use `maxConnections` from their config
- `minFreeConnections` keeps connections warm for faster queries
- `idleTimeoutMS` closes unused connections to save resources
- Debug mode logs to console + file (Winston logger)
- Logs rotate at 5MB, keeps 5 files
- Connection options follow MongoDB driver specifications

---

## Configuration Reference

### PolyMongoOptions
```typescript
interface PolyMongoOptions {
  mongoURI: string;              // Required: MongoDB connection URI
  defaultDB?: string;            // Default: 'default'
  maxPoolSize?: number;          // Default: 10
  minFreeConnections?: number;   // Default: 0
  idleTimeoutMS?: number;        // Default: undefined
  debug?: boolean;               // Default: false
  logPath?: string;              // Default: './logs/Polymongo'
  coldStart?: boolean;           // Default: true
  dbSpecific?: DBSpecificConfig[];
}
```

### DBSpecificConfig
```typescript
interface DBSpecificConfig {
  dbName: string;
  mongoURI?: string;  // Optional: separate cluster URI
  options: {
    autoClose?: boolean;
    ttl?: number;           // milliseconds
    maxConnections?: number;
    coldStart?: boolean;
  };
}
```

### ScaleOptions
```typescript
interface ScaleOptions {
  autoClose?: boolean;
  ttl?: number;
  maxConnections?: number;
  coldStart?: boolean;
  mongoURI?: string;  // For connectDB only
}
```

---

## API Reference

### Core Methods

#### `wrapModel<T>(model: mongoose.Model<T>): WrappedModel<T>`
Wraps a Mongoose model for multi-database access.

#### `transaction<T>(fn, options?): Promise<T>`
Executes operations within a MongoDB transaction.

#### `isConnected(): boolean`
Returns primary connection status.

#### `getConnectionState(): string`
Returns connection state: 'connected', 'disconnected', 'connecting', 'disconnecting'.

### Stats Methods

#### `stats.general(): ConnectionStats`
Returns comprehensive connection pool statistics.

#### `stats.db(dbName?: string): Promise<DbStats>`
Returns detailed statistics for a specific database.

#### `stats.listDatabases(): Promise<Array<{dbName, sizeInMB}>>`
Lists all databases with sizes.

### Scale Methods

#### `scale.setDB(dbNames: string[], options?: ScaleOptions): void`
Configures databases with separate connection pools (lazy initialization).

#### `scale.connectDB(dbNames: string[], options?: ScaleOptions): Promise<void>`
Immediately creates separate connection pools for databases.

### Hook Methods

#### `onDbConnect(callback: (db: Connection) => void): void`
Registers callback for any database connection.

#### `onDbDisconnect(callback: (db: Connection) => void): void`
Registers callback for any database disconnection.

#### `onTheseDBConnect(dbNames: string[], callback): void`
Registers callback for specific databases' connections.

#### `onTheseDBDisconnect(dbNames: string[], callback): void`
Registers callback for specific databases' disconnections.

### Bulk Tasks

#### `bulkTasks.copyDatabase(source: string, target: string): Promise<void>`
Copies all collections and indexes from source to target database.

#### `bulkTasks.dropDatabase(dbName: string): Promise<void>`
Permanently deletes a database.

#### `bulkTasks.export(dbName: string): Promise<ExportData>`
Exports entire database to JSON object.

#### `bulkTasks.import(dbName: string, data: ExportData): Promise<void>`
Imports database from JSON object.

#### `bulkTasks.exportStream(dbName: string): NodeJS.ReadableStream`
Streams database export as JSON (memory efficient).

#### `bulkTasks.importStream(dbName: string, stream): Promise<void>`
Imports database from JSON stream.

### Actions

#### `actions.closeAll(): Promise<void>`
Gracefully closes all connections.

#### `actions.forceCloseAll(): Promise<void>`
Immediately closes all connections.

#### `actions.closeDBstream(dbName: string): void`
Closes all watch streams for a database.

#### `actions.closeAllWatches(): void`
Closes all active watch streams.

---

## Usage Patterns

### Pattern 1: Multi-Tenant Application
```typescript
const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017'
});

const User = wrapper.wrapModel(UserModel);
const tenantDB = (tenantId: string) => User.db(`tenant_${tenantId}`);

app.get('/users', async (req, res) => {
  const users = await tenantDB(req.tenantId).find({});
  res.json(users);
});
```

### Pattern 2: Read Replicas
```typescript
const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017'
});

wrapper.scale.setDB(['analytics_readonly'], {
  mongoURI: 'mongodb://read-replica:27017',
  maxConnections: 20
});

const Report = wrapper.wrapModel(ReportModel);
const reports = await Report.db('analytics_readonly').find({});
```

### Pattern 3: Temporary Workspaces
```typescript
const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017'
});

wrapper.scale.setDB(['user_123_workspace'], {
  autoClose: true,
  ttl: 1800000, // 30 minutes
  maxConnections: 3
});

// Automatically cleans up after inactivity
```

### Pattern 4: Background Jobs
```typescript
const wrapper = new PolyMongoWrapper({
  mongoURI: 'mongodb://localhost:27017'
});

// Job queue database with separate pool
await wrapper.scale.connectDB(['job_queue'], {
  maxConnections: 5,
  coldStart: false
});

const Job = wrapper.wrapModel(JobModel);
await Job.db('job_queue').create({ task: 'process_data' });
```

---

## Error Handling

```typescript
try {
  await User.db('production').find({});
} catch (error) {
  if (error.message.includes('authentication failed')) {
    // Handle auth errors
  } else if (error.message.includes('not initialized')) {
    // Connection still initializing
  } else {
    // Other errors
  }
}
```

Common errors:
- `mongoURI is required` - Missing connection URI
- `Connection for ${dbName} is still initializing` - Query before connection ready
- `Database connection not ready` - Connection in invalid state
- `Max reconnection attempts reached` - Connection permanently failed

---

## Performance Tips

1. **Use coldStart for rarely-accessed databases** - Reduces memory footprint
2. **Set appropriate maxPoolSize** - Match your concurrent query load
3. **Enable autoClose for sporadic workloads** - Frees resources automatically
4. **Use separate pools for heavy operations** - Isolates analytics/reporting impact
5. **Monitor with stats.general()** - Identify pool saturation early
6. **Use stream operations for large datasets** - Prevents memory issues
7. **Set idleTimeoutMS** - Automatically closes unused connections

---

## TypeScript Support

Full TypeScript definitions included. All interfaces and types are exported:

```typescript
import {
  PolyMongoWrapper,
} from 'polymongo';
```

---

## License

MIT

## Repository

[github.com/Krishnesh-Mishra/Polymongo](https://github.com/Krishnesh-Mishra/Polymongo)