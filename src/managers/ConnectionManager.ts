// src/managers/ConnectionManager.ts
import mongoose, { Connection } from 'mongoose';
import { MetadataManager } from './MetadataManager';
import { EvictionManager } from './EvictionManager';
import { PolyMongoConfig, ConnectionStats, ConnectionMetadata } from '../types';
import { buildURI } from '../utils/uri';

export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  private stats: Map<string, ConnectionStats> = new Map();
  private watches: Map<string, boolean> = new Map();
  constructor(
    private config: PolyMongoConfig,
    private metadataManager: MetadataManager,
  ) {}

  setEvictionManager(evictionManager: EvictionManager) {
    this.evictionManager = evictionManager;
  }

  private evictionManager?: EvictionManager;

  getConnection(dbName: string): Connection {
    if (!this.connections.has(dbName)) {
      this.openConnection(dbName);
    }
    return this.connections.get(dbName)!;
  }

  openConnection(dbName: string): Connection {
    if (this.connections.has(dbName)) return this.connections.get(dbName)!;
    if (this.config.maxConnections && this.connections.size >= this.config.maxConnections) {
      const evicted = this.evictionManager?.evictIfPossible();
      if (!evicted && !this.canExceedLimit(dbName)) {
        console.warn('Max connections reached');
      }
    }
    const uri = buildURI(this.config.mongoURI, dbName);
    const conn = mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
    });
    this.connections.set(dbName, conn);
    const defaultMeta: ConnectionMetadata = {
      dbName,
      priority: 100,
      useCount: 0,
      avgInterval: 0,
      lastUsed: Date.now(),
    };
    this.stats.set(dbName, { ...defaultMeta, idleTime: 0, hasWatch: false });
    this.metadataManager.loadMetadata(dbName).then(meta => {
      const stat = this.stats.get(dbName);
      if (stat) {
        Object.assign(stat, meta);
      }
    }).catch((err: unknown) => console.error(err));
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

  useConnection(dbName: string): void {
    const now = Date.now();
    const stat = this.stats.get(dbName);
    if (stat) {
      const interval = now - stat.lastUsed;
      stat.useCount++;
      stat.avgInterval = ((stat.avgInterval * (stat.useCount - 1)) + interval) / stat.useCount;
      stat.lastUsed = now;
      stat.idleTime = 0;
      this.metadataManager.saveMetadata(stat).catch((err: unknown) => console.error(err));
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

  private canExceedLimit(dbName: string): boolean {
    const stat = this.stats.get(dbName);
    return stat ? stat.priority === -1 || stat.hasWatch : false;
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