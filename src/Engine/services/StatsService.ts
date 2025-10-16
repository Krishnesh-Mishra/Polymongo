import * as mongoose from "mongoose";
import { ConnectionManager } from "../managers/ConnectionManager";
import { LogManager } from "../managers/LogManager";
import { ConnectionStats } from "../../types/scale.types";
import { getDbStats } from "../../lib/dbStats";
import { DbStats } from "../../types/dbStats";
import { PoolStats } from "../../types";

export class StatsService {
  constructor(
    private connectionManager: ConnectionManager,
    private logManager: LogManager,
    private getPoolStats: (conn: mongoose.Connection | null) => PoolStats | null,
    private defaultDB: string
  ) { }

  general(): ConnectionStats {
    try {
      const primary = this.connectionManager.primary;
      const primaryPoolStats = this.getPoolStats(primary);
      const sharedDatabases = Array.from(this.connectionManager.connections.keys());

      const separate = Array.from(this.connectionManager.separateConnectionsInfo.values()).map(info => ({
        dbName: info.dbName,
        mongoURI: info.mongoURI,
        readyState: info.connection.readyState,
        lastAccessed: info.lastAccessed,
        isInitialized: info.isInitialized,
        config: info.config,
        poolStats: this.getPoolStats(info.connection),
      }));

      let totalConnectionsAcrossPools = 0;
      if (primaryPoolStats) totalConnectionsAcrossPools += primaryPoolStats.totalConnections;
      separate.forEach(s => {
        if (s.poolStats) totalConnectionsAcrossPools += s.poolStats.totalConnections;
      });

      const stats: ConnectionStats = {
        totalActivePools: (primary ? 1 : 0) + separate.length,
        totalConnectionsAcrossPools,
        primary: primary ? {
          readyState: primary.readyState,
          poolStats: primaryPoolStats,
          sharedDatabases,
        } : null,
        separateDB: separate,
      };

      this.logManager.log(`Connection stats: ${JSON.stringify(stats)}`);
      return stats;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error getting stats: ${errorMsg}`);
      throw new Error(`Failed to retrieve connection stats: ${errorMsg}`);
    }
  }

  async db(dbName?: string): Promise<DbStats> {
    try {
      return await getDbStats(this.connectionManager, this.logManager, dbName ?? this.defaultDB);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error getting DB stats for ${dbName}: ${errorMsg}`);
      throw new Error(`Failed to retrieve DB stats: ${errorMsg}`);
    }
  }

  async listDatabases(): Promise<Array<{ dbName: string; sizeInMB: number }>> {
    try {
      this.logManager.log("Listing all databases");

      const primary = this.connectionManager.initPrimary();

      await new Promise<void>((resolve, reject) => {
        if (primary.readyState === 1) resolve();
        else {
          primary.once('open', () => resolve());
          primary.once('error', reject);
        }
      });

      if (!primary.db) {
        throw new Error("Database connection not ready");
      }

      const admin = primary.db.admin();
      const result = await admin.listDatabases();

      return result.databases.map((db: any) => ({
        dbName: db.name,
        sizeInMB: parseFloat((db.sizeOnDisk / (1024 * 1024)).toFixed(2))
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error listing databases: ${errorMsg}`);
      throw new Error(`Failed to list databases: ${errorMsg}`);
    }
  }
}