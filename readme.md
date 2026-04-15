![Project Banner](./assets/Banner.png)

# PolyMongo

MongoDB wrapper for Mongoose with shared multi-database access, optional per-database pools, lifecycle events, and utility operations.

[![npm version](https://img.shields.io/npm/v/polymongo.svg)](https://www.npmjs.com/package/polymongo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

## Installation

```bash
npm install polymongo
```

## Quick Start

```ts
import PolyMongo from "polymongo";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
});

const wrapper = PolyMongo.createWrapper({
  mongoURI: "mongodb://localhost:27017",
  defaultDB: "production",
  coldStart: true,
  retry: 3000,
  debug: {
    log: true,
    logPath: "./logs/polymongo",
    logHandler: async (logMessage) => {
      console.log(logMessage);
    },
  },
});

const User = wrapper.wrapModel(mongoose.model("User", userSchema));

await wrapper.connect();

const admins = await User.find({ role: "admin" });
const analyticsUsers = await User.db("analytics").find();
```

## Main Ideas

- `wrapper.wrapModel(Model)` gives you a model that can switch databases with `.db("name")`.
- `wrapper.on("event", handler)` centralizes lifecycle listeners.
- `wrapper.connect()` and `wrapper.disconnect()` make startup and shutdown explicit.
- `wrapper.adv` exposes the underlying Mongoose connections and module when you need lower-level control.
- `PolyMongo.Types.*` makes the main public types easier to discover from IntelliSense.
- `dbSpecific` and `pool.configure()` let you give certain databases their own pool settings.

## Core API

### Create a wrapper

```ts
const wrapper = PolyMongo.createWrapper({
  mongoURI: "mongodb://localhost:27017",
  defaultDB: "main",
  maxPoolSize: 10,
  minFreeConnections: 0,
  idleTimeoutMS: 300000,
  coldStart: true,
  retry: 3000,
  debug: {
    log: true,
    logPath: "./logs",
    logHandler: async (logMessage) => {
      console.log(logMessage);
    },
  },
  dbSpecific: [
    {
      dbName: "analytics",
      mongoURI: "mongodb://analytics-cluster:27017",
      options: {
        maxConnections: 25,
        autoClose: true,
        ttl: 300000,
        coldStart: true,
      },
    },
  ],
});
```

### Connect and disconnect

```ts
const result = await wrapper.connect();

console.log(result.success); // true
console.log(result.alreadyConnected); // true when eager startup already connected
console.log(result.defaultDB); // configured default database

const disconnected = await wrapper.disconnect();
console.log(disconnected.alreadyDisconnected);
```

Behavior notes:

- If `coldStart: false`, PolyMongo starts connecting during wrapper creation.
- Calling `wrapper.connect()` after that does not reconnect unnecessarily.
- If the wrapper is already connected, `connect()` returns `{ success: true, alreadyConnected: true }`.
- If the wrapper is disconnected, `connect()` initializes the connection and waits until it is ready.
- If `retry` is set, PolyMongo keeps retrying failed connections on that fixed interval in milliseconds.
- If `retry` is omitted, PolyMongo does not auto-retry after connection failures or disconnects.

### Logging config

```ts
const wrapper = PolyMongo.createWrapper({
  mongoURI: "mongodb://localhost:27017",
  debug: {
    log: true,
    logPath: "./logs/polymongo",
    logHandler: async (logMessage) => {
      // Forward PolyMongo logs to your own system
      await myLogger.write(logMessage);
    },
  },
});
```

Logging behavior:

- `debug.log` turns PolyMongo debug logging on or off.
- `debug.logPath` enables file logging through Winston only when you provide a folder path.
- `debug.logHandler` lets you consume each formatted log line yourself.
- If `debug.log` is `true` but no `logPath` or `logHandler` is provided, PolyMongo emits nothing externally.
- Top-level `logPath` still works for backward compatibility, but `debug.logPath` is the preferred shape.

### Advanced Access

You do not lose raw Mongoose access by using PolyMongo. The wrapper exposes the same internals it uses through `wrapper.adv`.

```ts
const wrapper = PolyMongo.createWrapper({
  mongoURI: "mongodb://localhost:27017",
  retry: 3000,
});

const mongooseRef = wrapper.adv.mongoose;
const primaryConnection = wrapper.adv.getPrimaryConnection();
const ensuredPrimary = wrapper.adv.getOrCreatePrimaryConnection();
const activeDbConnection = wrapper.adv.getConnection("analytics");
const sharedDbConnection = wrapper.adv.getSharedConnection("analytics");
```

This is useful when:

- you want direct access to `mongoose.Schema`, sessions, plugins, or connection methods
- you need a raw connection for an edge case PolyMongo does not wrap directly
- you want PolyMongo convenience without giving up old Mongoose workflows

### IntelliSense Types

PolyMongo also exposes discoverable type names under `PolyMongo.Types.*`.

```ts
import PolyMongo from "polymongo";

type WrapperOptions = PolyMongo.Types.wrapperOptions;
type ConnectEvent = PolyMongo.Types.connectEvent;
type AdvancedAccess = PolyMongo.Types.advancedAccess;
```

### Wrap models

```ts
const UserModel = mongoose.model("User", userSchema);
const User = wrapper.wrapModel(UserModel);

await User.create({ name: "Ava", role: "admin" });
await User.db("archive").find();
await User.db("analytics").aggregate([{ $match: { role: "admin" } }]);
```

### Events in one place

Use one event method for all lifecycle hooks:

```ts
const unsubscribe = wrapper.on("connect", async (event) => {
  console.log(event.name); // "connect"
  console.log(event.dbName);
  console.log(event.state);
  console.log(event.timestamp);
});

wrapper.on("disconnect", (event) => {
  console.log("Disconnected from", event.dbName);
});

wrapper.on("error", (event) => {
  console.error(event.error.message);
});
```

Supported event names:

- `"connect"`
- `"disconnect"`
- `"error"`
- `"onDbConnect"` as an alias of `"connect"`
- `"onDbDisconnect"` as an alias of `"disconnect"`

Event payload fields:

- `name`: emitted event name
- `dbName`: mongoose connection database name
- `readyState`: raw mongoose ready state number
- `state`: readable state label
- `connection`: mongoose connection instance
- `timestamp`: ISO timestamp
- `error`: included only for `"error"`

### Configure pools

```ts
wrapper.pool.configure(["analytics"], {
  maxConnections: 30,
  autoClose: true,
  ttl: 300000,
  coldStart: false,
});

await wrapper.pool.connect(["reporting"], {
  maxConnections: 15,
});
```

### Stats

```ts
const generalStats = wrapper.stats.general();
const analyticsStats = await wrapper.stats.db("analytics");
const databases = await wrapper.stats.listDatabases();
```

### Ping

```ts
const defaultPing = await wrapper.ping();
const analyticsPing = await wrapper.ping("analytics");
```

### Database actions

```ts
const exported = await wrapper.actions.exportDB("production");
await wrapper.actions.importDB("backup", exported);

await wrapper.actions.copyDatabase("production", "staging");
await wrapper.actions.dropDatabase("old_data");
```

Streaming helpers use NDJSON so import can process one record at a time instead of rebuilding one giant JSON document in memory.

```ts
const writeStream = wrapper.actions.exportDBStream("analytics");
await wrapper.actions.importDBStream("restored", readStream, {
  batchSize: 1000,
  stopOnError: false,
});
```

NDJSON stream shape:

```json
{"type":"meta","format":"polymongo.ndjson","version":1,"database":"analytics","exportedAt":"2026-04-15T00:00:00.000Z"}
{"type":"collection","collection":"users"}
{"type":"index","collection":"users","index":{"name":"email_1","key":{"email":1},"unique":true}}
{"type":"document","collection":"users","document":{"_id":"...","email":"a@b.com"}}
{"type":"collectionEnd","collection":"users"}
```

### Watch stream cleanup

```ts
const changes = User.db("production").watch();

changes.on("change", (change) => {
  console.log(change);
});

wrapper.actions.closeDBstream("production");
wrapper.actions.closeAllWatches();
```

## TypeScript Notes

PolyMongo ships declaration files for:

- `PolyMongoOptions`
- `WrappedModel<T>`
- event names and event payloads used by `wrapper.on(...)`
- `connect()` and `disconnect()` result objects
- `wrapper.pool`, `wrapper.actions`, `wrapper.stats`, and `wrapper.ping()` return types
- advanced access types exposed through `wrapper.adv`
- `PolyMongo.Types.*` aliases for easier discovery in editors

Because the public methods include JSDoc, editors should show parameter and return help directly in autocomplete.

## Migration Notes

### Old hook methods

Old style:

```ts
wrapper.onDbConnect((connection) => {});
wrapper.onDbDisconnect((connection) => {});
```

New style:

```ts
wrapper.on("connect", (event) => {});
wrapper.on("disconnect", (event) => {});
```

### Transactions

The old `wrapper.transaction(...)` helper has been removed from the wrapper API.

If you need transactions, use Mongoose sessions directly from your own application flow so session ownership stays explicit.

## Health Checks

```ts
if (wrapper.isConnected()) {
  console.log("Database ready");
}

console.log(wrapper.getConnectionState());
console.log(await wrapper.ping());
```

## License

MIT © Krishnesh Mishra
