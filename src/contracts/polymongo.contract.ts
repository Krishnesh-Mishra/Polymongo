// src/contracts/polymongo.contract.ts
import * as mongoose from "mongoose";
import { DBSpecificConfig } from "./connection.contract";

/**
 * Options for initializing the wrapper.
 */
/**
 * Configuration options for initializing the PolyMongo wrapper.
 */
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
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Custom directory path for log files */
  logPath?: string;
  /** If true, connection initializes on first query (default: true) */
  coldStart?: boolean;
  /** Per-database specific configurations */
  dbSpecific?: DBSpecificConfig[];
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
/**
 * Connection statistics interface.
 */
