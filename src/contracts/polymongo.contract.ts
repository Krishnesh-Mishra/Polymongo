// src/contracts/polymongo.contract.ts
import mongoose from "mongoose";
import { DBSpecificConfig } from "./connection.contract";
import { DbStats } from "./watch.contract";

/**
 * Options for initializing the wrapper.
 */
/**
 * Configuration options for initializing the PolyMongo wrapper.
 */
export interface PolyMongoDebugOptions {
  /**
   * Enables PolyMongo debug log emission.
   * When false, logs are not written to files or forwarded to callbacks.
   */
  log?: boolean;
  /**
   * Optional folder where Winston should write PolyMongo log files.
   * If omitted, no file logger is created.
   */
  logPath?: string;
  /**
   * Optional callback that receives each formatted log line.
   * Useful when you want to forward PolyMongo logs into your own logger.
   */
  logHandler?: (logMessage: string) => void | Promise<void>;
}

/**
 * Internal escape-hatch helpers exposed on `wrapper.adv`.
 * These helpers exist for advanced users who still want direct access
 * to the underlying Mongoose primitives used by PolyMongo.
 */
export interface PolyMongoAdvancedAccess {
  /**
   * The exact Mongoose module instance used internally by PolyMongo.
   * Use this when you want access to raw Mongoose APIs without importing a second copy.
   */
  mongoose: typeof mongoose;
  /**
   * Returns the already-created primary connection if one exists.
   * This does not create a new connection.
   */
  getPrimaryConnection: () => mongoose.Connection | undefined;
  /**
   * Creates the primary connection if needed and returns it.
   * Useful when advanced callers want to work with the shared root connection directly.
   */
  getOrCreatePrimaryConnection: () => mongoose.Connection;
  /**
   * Returns the connection that PolyMongo would use for the requested database.
   * This may initialize the shared or dedicated database connection on demand.
   * @param dbName - Database name to resolve, falling back to the wrapper default database
   */
  getConnection: (dbName?: string) => mongoose.Connection;
  /**
   * Returns the shared `useDb()` connection for the requested database.
   * This is helpful when you want the same database switching behavior PolyMongo uses internally.
   * @param dbName - Database name to resolve, falling back to the wrapper default database
   */
  getSharedConnection: (dbName?: string) => mongoose.Connection;
}

export interface PolyMongoOptions {
  /** Primary MongoDB connection URI */
  mongoURI: string;
  /** Default database name to use when none is specified */
  defaultDB?: string;
  /** Maximum number of connections per pool (default: 10) */
  maxPoolSize?: number;
  /** Minimum number of idle connections to maintain (default: 0) */
  minFreeConnections?: number;
  /** Connection idle timeout in milliseconds */
  idleTimeoutMS?: number;
  /**
   * Logging configuration.
   * You can still pass a boolean for backward compatibility, but the object form is preferred.
   */
  debug?: boolean | PolyMongoDebugOptions;
  /** Deprecated: prefer `debug.logPath` */
  logPath?: string;
  /** If true, connection initializes on first query (default: true) */
  coldStart?: boolean;
  /**
   * Retry interval in milliseconds for reconnect attempts.
   * When provided, PolyMongo keeps retrying after connection errors or disconnects.
   * When omitted, automatic reconnect attempts are disabled.
   */
  retry?: number;
  /** Per-database specific configurations */
  dbSpecific?: DBSpecificConfig[];
}

/**
 * Event names emitted by the PolyMongo wrapper.
 */
export type PolyMongoEventName =
  | "connect"
  | "disconnect"
  | "error"
  | "onDbConnect"
  | "onDbDisconnect";

/**
 * Payload delivered to event listeners registered with `wrapper.on(...)`.
 */
export interface PolyMongoEventMap {
  /**
   * Fired when a connection becomes ready.
   */
  connect: PolyMongoConnectEvent;
  /**
   * Fired when a connection is disconnected or explicitly closed.
   */
  disconnect: PolyMongoDisconnectEvent;
  /**
   * Fired when mongoose emits a connection error.
   */
  error: PolyMongoErrorEvent;
  /**
   * Alias for `connect` kept for users who prefer the older naming style.
   */
  onDbConnect: PolyMongoConnectEvent;
  /**
   * Alias for `disconnect` kept for users who prefer the older naming style.
   */
  onDbDisconnect: PolyMongoDisconnectEvent;
}

/**
 * Shared event payload fields for all wrapper lifecycle events.
 */
export interface PolyMongoBaseEvent {
  /** The event name that triggered the listener. */
  name: PolyMongoEventName;
  /** The database name reported by the underlying mongoose connection. */
  dbName: string;
  /** The current mongoose ready state number for this connection. */
  readyState: number;
  /** The current mongoose ready state label for this connection. */
  state: "disconnected" | "connected" | "connecting" | "disconnecting" | "unknown";
  /** The underlying mongoose connection instance. */
  connection: mongoose.Connection;
  /** ISO timestamp for when the event payload was created. */
  timestamp: string;
}

/**
 * Emitted after a connection is established.
 */
export interface PolyMongoConnectEvent extends PolyMongoBaseEvent {
  name: "connect" | "onDbConnect";
}

/**
 * Emitted after a connection is disconnected or closed.
 */
export interface PolyMongoDisconnectEvent extends PolyMongoBaseEvent {
  name: "disconnect" | "onDbDisconnect";
}

/**
 * Emitted when the underlying connection reports an error.
 */
export interface PolyMongoErrorEvent extends PolyMongoBaseEvent {
  name: "error";
  /** The original error emitted by mongoose. */
  error: Error;
}

/**
 * Result returned by `wrapper.connect()`.
 */
export interface PolyMongoConnectResult {
  /** Indicates that the wrapper is ready to serve queries. */
  success: true;
  /** True when the wrapper was already connected before the call finished. */
  alreadyConnected: boolean;
  /** The default database configured on the wrapper. */
  defaultDB: string;
  /** The underlying primary connection instance. */
  connection: mongoose.Connection;
  /** The current state after the operation completes. */
  state: "connected";
}

/**
 * Result returned by `wrapper.disconnect()`.
 */
export interface PolyMongoDisconnectResult {
  /** Indicates that the disconnect operation completed. */
  success: true;
  /** True when there was no active connection to close. */
  alreadyDisconnected: boolean;
  /** The wrapper state after disconnect completes. */
  state: "disconnected";
}

/**
 * Statistics for a specific connection pool.
 */
export interface PoolStats {
  /** Total number of connections (active + idle) */
  totalConnections: number;
  /** Number of connections available for use */
  availableConnections: number;
  /** Number of connections currently being used */
  inUseConnections: number;
  /** Number of operations waiting for a connection */
  waitQueueSize: number;
  /** Maximum allowed connections in this pool */
  maxPoolSize: number;
  /** Minimum connections maintained in this pool */
  minPoolSize: number;
  /** Idle timeout for connections in this pool */
  maxIdleTimeMS?: number;
}

export interface PingResult {
  ok: true;
  dbName: string;
  latency: number;
  timestamp: string;
}

export interface CollectionFailure {
  collection: string;
  stage: "export" | "import" | "index";
  message: string;
}

export interface CollectionTransferSummary {
  collection: string;
  documents: number;
  indexes: number;
}

export interface DatabaseActionSummary {
  database: string;
  collections: CollectionTransferSummary[];
  failures: CollectionFailure[];
}

export interface DatabaseExportSummary extends DatabaseActionSummary {
  exportedAt: string;
  format: "json";
}

export interface DatabaseImportSummary extends DatabaseActionSummary {
  importedAt: string;
  insertedDocuments: number;
  createdIndexes: number;
}

export interface DatabaseCopySummary {
  source: string;
  target: string;
  importedAt: string;
  collections: CollectionTransferSummary[];
  failures: CollectionFailure[];
  insertedDocuments: number;
  createdIndexes: number;
}

export type PolyMongoStreamRecord =
  | {
      type: "meta";
      format: "polymongo.ndjson";
      version: 1;
      database: string;
      exportedAt: string;
    }
  | {
      type: "collection";
      collection: string;
    }
  | {
      type: "index";
      collection: string;
      index: Record<string, any>;
    }
  | {
      type: "document";
      collection: string;
      document: Record<string, any>;
    }
  | {
      type: "collectionEnd";
      collection: string;
    };

export interface PolyMongoStatsApi {
  general: () => import("./connection.contract").ConnectionStats;
  db: (dbName?: string) => Promise<DbStats>;
  listDatabases: () => Promise<Array<{ dbName: string; sizeInMB: number }>>;
}

export interface PolyMongoPoolApi {
  connect: (
    dbNames: string[],
    options?: import("./connection.contract").ScaleOptions
  ) => Promise<void>;
  configure: (
    dbNames: string[],
    options?: import("./connection.contract").ScaleOptions & { mongoURI?: string }
  ) => void;
}

export interface PolyMongoScaleApi {
  connectDB: (
    dbNames: string[],
    options?: import("./connection.contract").ScaleOptions
  ) => Promise<void>;
  setDB: (
    dbNames: string[],
    options?: import("./connection.contract").ScaleOptions & { mongoURI?: string }
  ) => void;
}

export interface PolyMongoActionsApi {
  copyDatabase: (sourceDB: string, targetDB: string) => Promise<DatabaseCopySummary>;
  dropDatabase: (dbName: string) => Promise<void>;
  exportDB: (dbName: string) => Promise<any>;
  importDB: (dbName: string, data: any) => Promise<DatabaseImportSummary>;
  exportDBStream: (dbName: string) => NodeJS.ReadableStream;
  importDBStream: (
    dbName: string,
    stream: NodeJS.ReadableStream,
    options?: { batchSize?: number; stopOnError?: boolean }
  ) => Promise<DatabaseImportSummary>;
  closeAll: () => Promise<void>;
  forceCloseAll: () => Promise<void>;
  closeDBstream: (dbName: string) => void;
  closeAllWatches: () => void;
}

/**
 * Wrapped model interface with db method.
 */
// In your types file
/**
 * A Mongoose model wrapped with PolyMongo functionality.
 * Extends the standard Mongoose Model with a `.db()` method for dynamic switching.
 */
export type WrappedModel<T> = {
  /**
   * Switches the model to a different database context.
   * @param dbName - The name of the database to switch to.
   * @returns The Mongoose model bound to the specified database.
   */
  db: (dbName?: string) => mongoose.Model<T>;
} & mongoose.Model<T>;
