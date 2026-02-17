# 🗺️ PolyMongo Roadmap

This roadmap outlines the planned evolution of **PolyMongo**, from version 1.2.7 to the major v2.0 release. The focus is on moving from a "bicycle engine" to a "rocket engine" — prioritizing reliability, developer experience (DX), and extreme scalability.

---

## 🛠️ Phase 1: Stability & Reliability (v1.2.x)

Focus: Ironing out edge cases, improving error handling, and refining the "Single TCP" strategy.

### 📍 v1.2.7: Reliability & Maintenance
- **Transaction Robustness**: Improved error messages and fallback logic when replica sets/sharded clusters are unavailable.
- **Cache Integrity**: Fix edge cases where `dbCache` might hold stale connection references.
- **Health Check Improvements**: `StatsService` enhancement to provide more accurate data during connection state transitions.

### 📍 v1.2.8: Observability
- **Slow Query Logging**: Optional threshold-based logging to identify performance bottlenecks.
- **Enhanced Connection State**: More granular states (e.g., `retrying`, `authentication_failed`) in `getConnectionState()`.
- **Winston Refinement**: Better control over log levels and formatting.

### 📍 v1.2.9: Pool Optimization
- **Idle Management**: Support for `maxIdleTimeMS` at the individual database level in `dbSpecific` config.
- **Retry Logic**: Built-in exponential backoff for the primary connection initialization.
- **Map Lookup Optimization**: Reducing overhead in `getSharedConnection` for high-frequency access patterns.

### 📍 v1.2.10: Model & Type Polish
- **Mongoose Discriminators**: Full support for wrapped models using discriminators.
- **Type Safety**: Improved TypeScript definitions for `WrappedModel` to ensure 1:1 parity with Mongoose models.
- **Index Management**: Utility to check if a database exists/is accessible before attempting a connection.

---

## 🚀 Phase 2: Feature Expansion & DX (v1.3 - v1.9)

Focus: Adding utility layers, monitoring tools, and advanced MongoDB cluster support.

### 📍 v1.3: The Monitoring Layer
- **Live Stats Dashboard**: A built-in (optional) server to view real-time pool usage and database load.
- **Metric Exports**: Support for Prometheus and Grafana integration.
- **Log Rotation**: Automatic multi-transport support and rotation management in `LogManager`.

### 📍 v1.4: Cloud & Atlas Optimization
- **Serverless Profiles**: Pre-configured pooling options optimized for [MongoDB Atlas Serverless](https://www.mongodb.com/atlas/database).
- **Transient Error Handling**: Resilient retry logic specifically for cloud network hiccups.
- **IAM Authentication**: Support for AWS/Azure/GCP identity-based authentication.

### 📍 v1.5: Advanced Transactions & Consistency
- **Snapshot Isolation**: Support for read concerns in `transaction` helper.
- **Multi-DB Transactions**: Orchestration for transactions spanning multiple databases in the same cluster.
- **Auto-Retry Writes**: Automatically handle write conflicts with configurable retry policies.

### 📍 v1.7: Watch Stream Pro
- **Global Change Streams**: Ability to watch all databases with a single, intelligently managed stream.
- **Resume Token Support**: Automatic persistence and recovery of watch streams after disconnection.
- **Stream Throttling**: Manage resource usage for high-volume change events.

### 📍 v1.8: Intelligent Schema Management
- **Validation Sync**: Automatically sync Mongoose schema validations across all tenant databases.
- **Index Drift Detection**: Tools to compare and sync indexes across different databases.
- **Bulk Index Ops**: Create or drop indexes across hundreds of databases in one command.

### 📍 v1.9: Advanced Routing
- **Read-Replica Routing**: Automatically route `find` queries to replicas while keeping writes on the primary.
- **Cross-Cluster Routing**: Seamlessly route queries to different MongoDB clusters based on database prefix.
- **Load Balancing**: Distribute connections across multiple clusters to prevent single-cluster saturation.

---

## ☄️ Phase 3: The Rocket Engine (v2.0)

Focus: Major architectural shift, maximum performance, and modularity.

### 📍 v2.0: The Modular Core
- **Plugin Architecture**: A fully extensible core where developers can write custom middleware for connection lifecycle events.
- **Native Driver Mode**: Option to use PolyMongo with the native MongoDB Node.js driver (bypassing Mongoose) for extreme performance cases.
- **Edge Runtime Support**: Optimized build for Next.js Edge, Vercel Functions, and Cloudflare Workers.
- **Project Scaling (10k+)**: Architectural changes to support seamless management of tens of thousands of active databases.
- **Zero-Config Sync**: Auto-discovery of databases and dynamic schema loading.

---

> [!TIP]
> Each version will go through rigorous integration testing to ensure no breaking changes for existing PolyMongo users.

> [!IMPORTANT]
> This roadmap is living and will be updated based on community feedback and emerging MongoDB features.
