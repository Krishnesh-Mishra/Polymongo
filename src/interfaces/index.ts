// src/interfaces/index.ts
import { Model, Connection, Document } from 'mongoose';
import { PolyMongoConfig, ConnectionStats } from '../types';

export interface IWrapper {
  config: PolyMongoConfig;
  stats(): ConnectionStats[];
  setPriority(dbName: string, priority: number): Promise<void>;
  openConnection(dbName: string): Promise<Connection>;
  closeConnection(dbName: string): Promise<void>;
  destroy(): Promise<void>;
  wrapModel<T extends Document>(model: Model<T>): WrappedModel<T>;
}

// @ts-expect-error db type conflict with Mongoose Model.db
export interface WrappedModel<T extends Document> extends Model<T> {
  db(dbName: string): WrappedModel<T>;
}