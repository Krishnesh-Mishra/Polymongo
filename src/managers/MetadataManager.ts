// src/managers/MetadataManager.ts
import mongoose, { Connection, Schema, Document } from 'mongoose';
import { ConnectionMetadata } from '../types';
import { buildURI } from '../utils/uri';

interface MetadataDocument extends Document, ConnectionMetadata {}

const metadataSchema = new Schema<MetadataDocument>({
  dbName: { type: String, unique: true, required: true },
  priority: { type: Number, default: 100 },
  useCount: { type: Number, default: 0 },
  avgInterval: { type: Number, default: 0 },
  lastUsed: { type: Number, default: Date.now },
}, { versionKey: false });

export class MetadataManager {
  private connection: Connection;
  private MetadataModel;

  constructor(mongoURI: string, metadataDB: string) {
    const uri = buildURI(mongoURI, metadataDB);
    this.connection = mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
    });
    this.MetadataModel = this.connection.model<MetadataDocument>('ConnectionMetadata', metadataSchema);
  }

  async loadMetadata(dbName: string): Promise<ConnectionMetadata> {
    let meta = await this.MetadataModel.findOne({ dbName });
    if (!meta) {
      meta = new this.MetadataModel({ dbName });
      await meta.save();
    }
    return meta.toObject() as ConnectionMetadata;
  }

  async saveMetadata(meta: ConnectionMetadata): Promise<void> {
    const { dbName, priority, useCount, avgInterval, lastUsed } = meta;
    const updateData = { dbName, priority, useCount, avgInterval, lastUsed };
    await this.MetadataModel.updateOne({ dbName: meta.dbName }, updateData, { upsert: true });
  }

  async setPriority(dbName: string, priority: number): Promise<void> {
    await this.MetadataModel.updateOne({ dbName }, { priority });
  }

  async destroy(): Promise<void> {
    await this.connection.close();
  }
}