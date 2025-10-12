// src/core/PolyMongo.ts
import { Model, Document, Connection } from 'mongoose';
import { PolyMongoConfig, ConnectionStats } from '../types';
import { IWrapper, WrappedModel } from '../interfaces';
import { MetadataManager } from '../managers/MetadataManager';
import { ConnectionManager } from '../managers/ConnectionManager';
import { EvictionManager } from '../managers/EvictionManager';
import createWrappedModel from '../models/WrapperModel';

const DEFAULT_CONFIG: Partial<PolyMongoConfig> = {
  metadataDB: 'polymongo-metadata',
  defaultDB: 'Default-DB',
  idleTimeout: 600000,
};

class PolyMongo implements IWrapper {
  public config: PolyMongoConfig;
  private metadataManager: MetadataManager;
  public connectionManager: ConnectionManager;
  private evictionManager: EvictionManager;

  constructor(config: PolyMongoConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (!this.config.mongoURI) {
      throw new Error('mongoURI is required');
    }
    this.metadataManager = new MetadataManager(this.config.mongoURI, this.config.metadataDB!);
    this.connectionManager = new ConnectionManager(this.config, this.metadataManager, null as any); // Temp
    this.evictionManager = new EvictionManager(this.connectionManager, this.config.idleTimeout!);
    this.connectionManager['evictionManager'] = this.evictionManager; // Patch
  }

  static createWrapper(config: PolyMongoConfig): PolyMongo {
    return new PolyMongo(config);
  }

  wrapModel<T extends Document>(model: Model<T>): WrappedModel<T> {
    return createWrappedModel<T>(this, model.schema, model.modelName);
  }

  stats(): ConnectionStats[] {
    return this.connectionManager.getStats();
  }

  async setPriority(dbName: string, priority: number): Promise<void> {
    await this.metadataManager.setPriority(dbName, priority);
    const stat = this.stats().find(s => s.dbName === dbName);
    if (stat) stat.priority = priority;
  }

  async openConnection(dbName: string): Promise<Connection> {
    return this.connectionManager.openConnection(dbName);
  }

  async closeConnection(dbName: string): Promise<void> {
    await this.connectionManager.closeConnection(dbName);
  }

  async destroy(): Promise<void> {
    this.evictionManager.destroy();
    await this.connectionManager.destroy();
    await this.metadataManager.destroy();
  }
}

export default PolyMongo;