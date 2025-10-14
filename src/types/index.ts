// src/types/index.ts
import * as mongoose from "mongoose";

/**
 * Options for initializing the wrapper.
 */
export interface PolyMongoOptions {
  mongoURI: string;
  maxPoolSize?: number;
  minFreeConnections?: number;
  idleTimeoutMS?: number;
  debug?: boolean;
  logPath?: string;
  coldStart?: boolean;
  defaultDB?: string;
}

/**
 * Wrapped model interface with db method.
 */
export interface WrappedModel<T extends mongoose.Document> {
  db: (dbName?: string) => mongoose.Model<T>;
}

/**
 * Connection statistics interface.
 */
export interface ConnectionStats {
  activeConnections: number;
  databases: string[];
  poolStats: {
    totalConnections: number;
    maxPoolSize: number;
    minFreeConnections: number;
    idleTimeoutMS?: number;
  } | null;
}
