// src/infrastructure/mongo.adapter.ts
import * as mongoose from "mongoose";
import { LogManager } from "./logger.adapter";
import { PoolStats } from "../contracts/polymongo.contract";

export function cleanMongoURI(uri: string, logManager: LogManager): string {
  try {
    const url = new URL(uri);
    // Remove the pathname (which contains the database name)
    url.pathname = '/';
    const cleanedURI = url.toString().replace(/\/$/, ''); // Remove trailing slash
    logManager.log(`Cleaned URI from ${uri} to ${cleanedURI}`);
    return cleanedURI;
  } catch (error) {
    logManager.log(`Failed to parse URI ${uri}, using as-is`);
    return uri;
  }
}

export function getPoolStats(conn: mongoose.Connection | null, maxPoolSize: number, minFreeConnections: number, idleTimeoutMS?: number): PoolStats | null {
  if (!conn) return null;
  const client = conn.getClient() as any;
  const pool = client?.s?.pool;
  if (!pool) return null;

  return {
    totalConnections: pool.totalConnectionCount ?? pool.totalCreatedConnectionCount ?? 0,
    availableConnections: pool.availableConnectionCount ?? pool.totalAvailableCount ?? 0,
    inUseConnections: pool.inUseConnectionCount ?? pool.totalInUseCount ?? 0,
    waitQueueSize: pool.waitQueueSize ?? pool.waitingClientsCount ?? pool.waitQueueMemberCount ?? 0,
    maxPoolSize: pool.maxPoolSize ?? maxPoolSize ?? 0,
    minPoolSize: pool.minPoolSize ?? minFreeConnections ?? 0,
    maxIdleTimeMS: pool.maxIdleTimeMS ?? idleTimeoutMS,
  };
}
