// src/types/index.ts
export interface PolyMongoConfig {
  mongoURI: string;
  metadataDB?: string;
  maxConnections?: number;
  defaultDB?: string;
  idleTimeout?: number;
}

export interface ConnectionMetadata {
  dbName: string;
  priority: number;
  useCount: number;
  avgInterval: number;
  lastUsed: number;
}

export interface ConnectionStats extends ConnectionMetadata {
  idleTime: number;
  hasWatch: boolean;
  score?: number;
}