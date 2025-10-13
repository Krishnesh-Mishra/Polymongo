// src/types/index.ts
import * as mongoose from 'mongoose';

/**
 * Options for initializing the wrapper.
 */
export interface PolyMongoOptions {
  mongoURI: string;
  poolSize?: number;
}

/**
 * Wrapped model interface with db method.
 */
export interface WrappedModel<T extends mongoose.Document> {
  db: (dbName?: string) => mongoose.Model<T>;
}