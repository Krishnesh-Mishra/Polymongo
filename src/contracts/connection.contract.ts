// src/contracts/connection.contract.ts
import * as mongoose from "mongoose";

/**
 * Specific configuration for a single database.
 */
export interface DBSpecificConfig {
  /** Database name */
  dbName: string;
  /** Optional separate MongoDB URI for this specific database */
  mongoURI?: string;
  /** Connection and lifecycle options for this database */
  options: {
    /** If true, closes connection after TTL expires (default: false) */
    autoClose?: boolean;
    /** Time in milliseconds to keep connection alive after last access */
    ttl?: number;
    /** Maximum connections for this specific database pool */
    maxConnections?: number;
    /** If true, connection occurs only on first access (default: true) */
    coldStart?: boolean;
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

/**
 * Aggregated connection statistics across the entire wrapper.
 */
export interface ConnectionStats {
  /** Number of active connection pools */
  totalActivePools: number;
  /** Total number of open connections across all pools */
  totalConnectionsAcrossPools: number;
  /** Statistics for the primary connection shared among databases */
  primary: PrimaryInfo | null;
  /** Statistics for databases with separate connection pools */
  separateDB: SeparateConnectionInfo[];
}
