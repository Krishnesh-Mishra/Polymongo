// src/types/index.ts
import * as mongoose from "mongoose";
import { DBSpecificConfig } from "./scale.types";

/**
 * Options for initializing the wrapper.
 */
export interface PolyMongoOptions {
  mongoURI: string;
  defaultDB?: string;
  maxPoolSize?: number;
  minFreeConnections?: number;
  idleTimeoutMS?: number;
  debug?: boolean;
  logPath?: string;
  coldStart?: boolean;
  dbSpecific?: DBSpecificConfig[];
}

export interface PoolStats {
  totalConnections: number;
  availableConnections: number;
  inUseConnections: number;
  waitQueueSize: number;
  maxPoolSize: number;
  minPoolSize: number;
  maxIdleTimeMS?: number;
}

/**
 * Wrapped model interface with db method.
 */
// In your types file
export type WrappedModel<T extends mongoose.Document> = {
  db: (dbName?: string) => mongoose.Model<T>;
} & mongoose.Model<T>;
/**
 * Connection statistics interface.
 */
