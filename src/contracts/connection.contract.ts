// src/contracts/connection.contract.ts
import * as mongoose from "mongoose";

export interface DBSpecificConfig {
  dbName: string;
  mongoURI?: string; // Optional separate URI for this DB
  options: {
    autoClose?: boolean;
    ttl?: number; // milliseconds
    maxConnections?: number;
    coldStart?: boolean; // Per-DB cold start option
  };
}

export interface ScaleOptions {
  autoClose?: boolean;
  ttl?: number;
  maxConnections?: number;
  coldStart?: boolean;
}

export interface ConnectionPoolInfo {
  dbName: string;
  connection: mongoose.Connection;
  config: DBSpecificConfig['options'];
  mongoURI?: string;
  lastAccessed: number;
  timer?: NodeJS.Timeout;
  isInitialized: boolean; // Track if connection is actually created
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

export interface SeparateConnectionInfo {
  dbName: string;
  mongoURI?: string;
  readyState: number;
  lastAccessed: number;
  isInitialized: boolean;
  config: DBSpecificConfig['options'];
  poolStats: PoolStats | null;
}

export interface PrimaryInfo {
  readyState: number;
  poolStats: PoolStats | null;
  sharedDatabases: string[];
}

export interface ConnectionStats {
  totalActivePools: number;
  totalConnectionsAcrossPools: number;
  primary: PrimaryInfo | null;
  separateDB: SeparateConnectionInfo[];
}
