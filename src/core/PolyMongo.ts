// src/core/polymongo.ts
import * as mongoose from 'mongoose';
import { PolyMongoOptions, WrappedModel, ConnectionStats } from '../types';

/**
 * Wrapper class for managing multiple MongoDB connections with Mongoose.
 */
class PolyMongoWrapper {
  private mongoURI: string;
  private maxPoolSize: number;
  private minFreeConnections: number;
  private idleTimeoutMS: number | undefined;
  private debug: boolean;
  private primary: mongoose.Connection | null = null;
  private connections: Map<string, mongoose.Connection> = new Map();

  /**
   * Constructor for the wrapper.
   * @param options - Configuration options including mongoURI, maxPoolSize, minFreeConnections, idleTimeoutMS, and debug.
   */
  constructor(options: PolyMongoOptions) {
    this.mongoURI = options.mongoURI;
    this.maxPoolSize = options.maxPoolSize ?? 10;
    this.minFreeConnections = options.minFreeConnections ?? 0;
    this.idleTimeoutMS = options.idleTimeoutMS ?? undefined;
    this.debug = options.debug ?? false;
  }

  /**
   * Logs messages if debug mode is enabled.
   * @param message - The message to log.
   */
  private _log(message: string): void {
    if (this.debug) {
      console.log(`[PolyMongo Debug] ${message}`);
    }
  }

  /**
   * Initializes the primary connection if not already created.
   * @returns The primary mongoose connection.
   */
  private _initPrimary(): mongoose.Connection {
    if (!this.primary) {
      this._log(`Initializing primary connection to ${this.mongoURI}`);
      this.primary = mongoose.createConnection(this.mongoURI, {
        maxPoolSize: this.maxPoolSize,
        minPoolSize: this.minFreeConnections,
        maxIdleTimeMS: this.idleTimeoutMS,
      });

      // Connection event handling and logging
      this.primary.on('connected', () => {
        this._log('MongoDB connected successfully');
      });

      this.primary.on('error', (err) => {
        console.error(`MongoDB connection error: ${err.message}`);
        this._log(`Connection error: ${err.message}`);
      });

      this.primary.on('disconnected', () => {
        this._log('MongoDB disconnected');
      });

      this.primary.on('reconnected', () => {
        this._log('MongoDB reconnected');
      });
    }
    return this.primary;
  }

  /**
   * Gets or creates a connection for the specified database.
   * @param dbName - The database name (default: 'default').
   * @returns The mongoose connection for the database.
   */
  private _getConnection(dbName: string = 'default'): mongoose.Connection {
    if (this.connections.has(dbName)) {
      this._log(`Using cached connection for database: ${dbName}`);
      return this.connections.get(dbName)!;
    }
    const primary = this._initPrimary();
    this._log(`Creating new connection for database: ${dbName}`);
    const conn = primary.useDb(dbName, { useCache: true });
    this.connections.set(dbName, conn);
    return conn;
  }

  /**
   * Wraps a base Mongoose model to support multiple databases.
   * @param baseModel - The base Mongoose model to wrap.
   * @returns An object with a db method to get model instances per database.
   */
  wrapModel<T extends mongoose.Document>(baseModel: mongoose.Model<T>): WrappedModel<T> {
    const wrapper = this;
    return {
      db: (dbName: string = 'default'): mongoose.Model<T> => {
        wrapper._log(`Accessing model ${baseModel.modelName} for database: ${dbName}`);
        const conn = wrapper._getConnection(dbName);
        return conn.model<T>(baseModel.modelName, baseModel.schema);
      },
    };
  }

  /**
   * Returns statistics about the connection pool.
   * @returns Connection statistics including active connections and pool details.
   */
  stats(): ConnectionStats {
    const stats: ConnectionStats = {
      activeConnections: this.connections.size,
      databases: Array.from(this.connections.keys()),
      poolStats: this.primary?.getClient()
        ? {
          totalConnections: (this.primary?.getClient() as any)?.s?.pool?.totalConnectionCount || 0,
          maxPoolSize: this.maxPoolSize,
          minFreeConnections: this.minFreeConnections,
          idleTimeoutMS: this.idleTimeoutMS,
        }
        : null,
    };
    this._log(`Connection stats: ${JSON.stringify(stats)}`);
    return stats;
  }
}

/**
 * PolyMongo object providing the wrapper class.
 */
export const PolyMongo = {
  createWrapper: PolyMongoWrapper,
};