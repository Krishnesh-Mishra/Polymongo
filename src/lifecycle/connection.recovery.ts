import mongoose from "mongoose";
import { ConnectionPoolInfo } from "../contracts/connection.contract";
import { LogManager } from "../infrastructure/logger.adapter";
import { CONNECTION_CONSTANTS } from "../policy/retry.policy";
import { HookManager } from "./client.lifecycle";

export interface ConnectionRecoveryContext {
  mongoURI: string;
  defaultDBName: string;
  maxPoolSize: number;
  minFreeConnections: number;
  idleTimeoutMS?: number;
  retryIntervalMS?: number;
  isShuttingDown: () => boolean;
  getPrimary: () => mongoose.Connection | null;
  setPrimary: (connection: mongoose.Connection | null) => void;
  getSeparateConnections: () => Map<string, ConnectionPoolInfo>;
}

export class ConnectionRecoveryService {
  private reconnectAttempts = 0;

  constructor(
    private context: ConnectionRecoveryContext,
    private logManager: LogManager,
    private hookManager?: HookManager
  ) {}

  public bind(connection: mongoose.Connection): void {
    connection.on("connected", () => {
      this.reconnectAttempts = 0;
      this.logManager.log("MongoDB connected successfully");
      this.hookManager?.emit(
        this.hookManager.createConnectEvent("connect", connection)
      );
    });

    connection.on("error", (err) => {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`MongoDB connection error: ${errorMsg}`);
      this.logManager.log(`Connection error: ${errorMsg}`);
      this.hookManager?.emit(
        this.hookManager.createErrorEvent(
          connection,
          err instanceof Error ? err : new Error(errorMsg)
        )
      );

      if (!this.context.isShuttingDown()) {
        this.handleConnectionError(err, connection);
      }
    });

    connection.on("disconnected", () => {
      this.logManager.log("MongoDB disconnected");
      this.hookManager?.emit(
        this.hookManager.createDisconnectEvent("disconnect", connection)
      );

      if (!this.context.isShuttingDown() && this.context.retryIntervalMS !== undefined) {
        this.handleConnectionError(new Error("Connection disconnected"), connection);
      }
    });

    connection.on("reconnected", () => {
      this.reconnectAttempts = 0;
      this.logManager.log("MongoDB reconnected successfully");
    });

    connection.on("close", () => {
      this.logManager.log("MongoDB connection closed");
    });
  }

  private handleConnectionError(
    error: Error,
    connection?: mongoose.Connection,
    poolInfo?: ConnectionPoolInfo
  ): void {
    this.logManager.log(`Handling connection error: ${error.message}`);

    if (error.message.includes("authentication failed") || error.message.includes("not authorized")) {
      this.logManager.log("Authentication error - stopping reconnection attempts");
      return;
    }

    if (connection && !poolInfo) {
      for (const candidate of this.context.getSeparateConnections().values()) {
        if (candidate.connection === connection) {
          poolInfo = candidate;
          break;
        }
      }
    }

    if (this.context.retryIntervalMS === undefined) {
      this.logManager.log("Retry is disabled; skipping reconnection");
      return;
    }

    this.attemptReconnect(poolInfo);
  }

  private attemptReconnect(poolInfo?: ConnectionPoolInfo): void {
    this.reconnectAttempts++;
    if (this.context.retryIntervalMS === undefined) {
      return;
    }

    const delay = this.context.retryIntervalMS;
    this.logManager.log(`Attempting reconnection #${this.reconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      if (this.context.isShuttingDown()) return;

      this.logManager.log("Reconnecting to MongoDB...");

      if (poolInfo) {
        this.reconnectSeparateConnection(poolInfo);
        return;
      }

      const primary = this.context.getPrimary();
      if (!primary || primary.readyState === 0) {
        this.reconnectPrimary();
      }
    }, delay);
  }

  private reconnectSeparateConnection(poolInfo: ConnectionPoolInfo): void {
    if (poolInfo.connection.readyState !== 0) {
      return;
    }

    try {
      poolInfo.connection = mongoose.createConnection(poolInfo.mongoURI || this.context.mongoURI, {
        dbName: poolInfo.dbName,
        maxPoolSize: poolInfo.config.maxConnections || this.context.maxPoolSize,
        minPoolSize: this.context.minFreeConnections,
        maxIdleTimeMS: this.context.idleTimeoutMS,
        serverSelectionTimeoutMS: CONNECTION_CONSTANTS.SERVER_SELECTION_TIMEOUT,
        socketTimeoutMS: CONNECTION_CONSTANTS.SOCKET_TIMEOUT,
        connectTimeoutMS: CONNECTION_CONSTANTS.CONNECT_TIMEOUT,
        bufferCommands: false,
      });
      this.bind(poolInfo.connection);
      this.logManager.log(`Separate connection for ${poolInfo.dbName} recreated`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Separate reconnect failed for ${poolInfo.dbName}: ${errorMsg}`);
      this.attemptReconnect(poolInfo);
    }
  }

  private reconnectPrimary(): void {
    try {
      const primary = mongoose.createConnection(this.context.mongoURI, {
        dbName: this.context.defaultDBName,
        maxPoolSize: this.context.maxPoolSize + 1,
        minPoolSize: this.context.minFreeConnections,
        maxIdleTimeMS: this.context.idleTimeoutMS,
        serverSelectionTimeoutMS: CONNECTION_CONSTANTS.SERVER_SELECTION_TIMEOUT,
        socketTimeoutMS: CONNECTION_CONSTANTS.SOCKET_TIMEOUT,
        connectTimeoutMS: CONNECTION_CONSTANTS.CONNECT_TIMEOUT,
        bufferCommands: false,
      });

      this.context.setPrimary(primary);
      this.bind(primary);
      this.logManager.log("Primary connection recreated");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Reconnect failed: ${errorMsg}`);
      this.attemptReconnect();
    }
  }
}
