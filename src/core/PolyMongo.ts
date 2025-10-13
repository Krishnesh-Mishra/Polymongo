// src/core/polymongo.ts
import * as mongoose from 'mongoose';
import { PolyMongoOptions, WrappedModel } from '../types';

/**
 * Wrapper class for managing multiple MongoDB connections with Mongoose.
 */
class PolyMongoWrapper {
  private mongoURI: string;
  private poolSize: number;
  private primary: mongoose.Connection | null = null;
  private connections: Map<string, mongoose.Connection> = new Map();

  /**
   * Constructor for the wrapper.
   * @param options - Configuration options including mongoURI and optional poolSize.
   */
  constructor(options: PolyMongoOptions) {
    this.mongoURI = options.mongoURI;
    this.poolSize = options.poolSize ?? 10;
  }

  /**
   * Initializes the primary connection if not already created.
   * @returns The primary mongoose connection.
   */
  private _initPrimary(): mongoose.Connection {
    if (!this.primary) {
      this.primary = mongoose.createConnection(this.mongoURI, {
        maxPoolSize: this.poolSize,
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
      return this.connections.get(dbName)!;
    }
    const primary = this._initPrimary();
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
      db(dbName: string = 'default'): mongoose.Model<T> {
        const conn = wrapper._getConnection(dbName);
        return conn.model<T>(baseModel.modelName, baseModel.schema);
      },
    };
  }
}

/**
 * PolyMongo object providing the wrapper class.
 */
const PolyMongo = {
  createWrapper: PolyMongoWrapper
};

export default PolyMongo;