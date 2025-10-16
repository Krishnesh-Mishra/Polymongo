import * as mongoose from "mongoose";
import { LogManager } from "../Engine/Manager/LogManager";
import { ConnectionManager } from "../Engine/Manager/ConnectionManager";
import { DbStats } from "../types/dbStats";
import { PoolStats } from "../types";

export async function getDbStats(
  connectionManager: ConnectionManager,
  logManager: LogManager,
  dbName: string
): Promise<DbStats> {
  const conn = connectionManager.getConnection(dbName);
  if (!conn.db) {
    throw new Error(`Database connection for ${dbName} is not initialized`);
  }
  const isSeparate = connectionManager.separateConnections.has(dbName);
  const poolInfo = isSeparate ? connectionManager.separateConnections.get(dbName) : undefined;
  const mongoURI = poolInfo?.mongoURI || connectionManager.mongoURI;
  const isInitialized = isSeparate ? !!poolInfo?.isInitialized : !!connectionManager.primary;
  const config = connectionManager.dbConfigs.get(dbName) || {};
  const poolStats: PoolStats | null = connectionManager.getPoolStats(conn);
  const lastUsed = isSeparate ? (poolInfo?.lastAccessed ?? 0) : (connectionManager.lastAccessedDbs.get(dbName) ?? 0);

  // Light stats for estimation
  const db = conn.db;
  const basicStats = await db.stats();
  const sizeMb = basicStats.dataSize / (1024 * 1024);
  const numCollections = basicStats.collections;

  // Estimate time: 50ms per collection
  const estimatedTimeMs = numCollections * 50;
  const useNewConn = estimatedTimeMs > 500;

  let statsConn = conn;
  if (useNewConn) {
    logManager.log(`Creating temp connection for stats on ${dbName}`);
    statsConn = await mongoose.createConnection(mongoURI, {
      dbName,
      maxPoolSize: 1,
      minPoolSize: 0,
    }).asPromise();
  }

  if (!statsConn.db) {
    throw new Error(`Database connection for ${dbName} is not initialized`);
  }

  try {
    const statsDb = statsConn.db;
    const collList = await statsDb.listCollections().toArray();
    const collections: DbStats["collections"] = [];

    for (const colInfo of collList) {
      if (colInfo.type !== "collection") continue;
      const collName = colInfo.name;
      const tempModel = statsConn.model(collName, new mongoose.Schema({}), collName);
      const docCount = await tempModel.estimatedDocumentCount();
      const collStats = await statsDb.command({ collStats: collName });
      const collSizeMb = (collStats.size || 0) / (1024 * 1024);
      collections.push({ name: collName, docCount, sizeMb: collSizeMb });
    }

    return {
      sizeMb,
      numCollections: collections.length,
      collections,
      lastUsed: new Date(lastUsed),
      mongoURI,
      isInitialized,
      config,
      poolStats,
    };
  } finally {
    if (useNewConn) {
      await statsConn.close();
    }
  }
}