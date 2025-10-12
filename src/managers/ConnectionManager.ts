// src/managers/ConnectionManager.ts
import mongoose, { Connection } from 'mongoose';
import { MetadataManager } from './MetadataManager';
import { EvictionManager } from './EvictionManager';
import { PolyMongoConfig, ConnectionStats } from '../types';

export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  private stats: Map<string, ConnectionStats> = new Map();
  private watches: Map<string, boolean> = new Map();
  constructor(
    private config: PolyMongoConfig,
    private metadataManager: MetadataManager,
    private evictionManager: EvictionManager
  ) {}

  async getConnection(dbName: string): Promise<Connection> {
    if (!this.connections.has(dbName)) {
      await this.openConnection(dbName);
    }
    return this.connections.get(dbName)!;
  }

  async openConnection(dbName: string): Promise<Connection> {
    if (this.connections.has(dbName)) return this.connections.get(dbName)!;
    if (this.config.maxConnections && this.connections.size >= this.config.maxConnections) {
      const evicted = await this.evictionManager.evictIfPossible();
      if (!evicted) {
        console.warn('Max connections reached, temporarily exceeding for priority or watch');
      }
    }
    const uri = `${this.config.mongoURI}/${dbName}`;
    const conn = await mongoose.createConnection(uri).asPromise();
    this.connections.set(dbName, conn);
    const meta = await this.metadataManager.loadMetadata(dbName);
    this.stats.set(dbName, { ...meta, idleTime: 0, hasWatch: false });
    return conn;
  }

  async closeConnection(dbName: string): Promise<void> {
    const conn = this.connections.get(dbName);
    if (conn) {
      await conn.close();
      this.connections.delete(dbName);
      this.stats.delete(dbName);
      this.watches.delete(dbName);
    }
  }

  async useConnection(dbName: string): Promise<void> {
    const now = Date.now();
    const stat = this.stats.get(dbName);
    if (stat) {
      const interval = now - stat.lastUsed;
      stat.useCount++;
      stat.avgInterval = ((stat.avgInterval * (stat.useCount - 1)) + interval) / stat.useCount;
      stat.lastUsed = now;
      stat.idleTime = 0;
      await this.metadataManager.saveMetadata(stat);
    }
  }

  markWatch(dbName: string, hasWatch: boolean): void {
    this.watches.set(dbName, hasWatch);
    const stat = this.stats.get(dbName);
    if (stat) stat.hasWatch = hasWatch;
  }

  getStats(): ConnectionStats[] {
    const now = Date.now();
    return Array.from(this.stats.values()).map(stat => ({
      ...stat,
      idleTime: now - stat.lastUsed,
    }));
  }

  async destroy(): Promise<void> {
    for (const conn of this.connections.values()) {
      await conn.close();
    }
    this.connections.clear();
    this.stats.clear();
    this.watches.clear();
  }
}