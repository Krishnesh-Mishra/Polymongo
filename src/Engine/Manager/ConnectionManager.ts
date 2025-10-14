// src/Engine/Manager/ConnectionManager.ts
import * as mongoose from "mongoose";
import { LogManager } from "./LogManager";

export class ConnectionManager {
  primary: mongoose.Connection | null = null;
  connections: Map<string, mongoose.Connection> = new Map();
  private isShuttingDown: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_INTERVAL = 5000; // 5 seconds

  constructor(
    private mongoURI: string,
    private maxPoolSize: number,
    private minFreeConnections: number,
    private idleTimeoutMS: number | undefined,
    private logManager: LogManager
  ) {
    this.setupGracefulShutdown();
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      this.logManager.log(
        `${signal} received, closing MongoDB connections gracefully...`
      );
      try {
        await this.forceCloseAll();
        this.logManager.log("MongoDB connections closed successfully");
        process.exit(0);
      } catch (error) {
        this.logManager.log(
          `Error during graceful shutdown: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        process.exit(1);
      }
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2")); // nodemon restart
  }

  public initPrimary(): mongoose.Connection {
    if (!this.primary) {
      this.logManager.log(
        `Initializing primary connection to ${this.mongoURI}`
      );

      try {
        this.primary = mongoose.createConnection(this.mongoURI, {
          maxPoolSize: this.maxPoolSize + 1,
          minPoolSize: this.minFreeConnections,
          maxIdleTimeMS: this.idleTimeoutMS,
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          connectTimeoutMS: 10000,
        });

        this.logManager.log(
          `Primary connection options: maxPoolSize=${this.maxPoolSize + 1}, minPoolSize=${this.minFreeConnections}, maxIdleTimeMS=${this.idleTimeoutMS}`
        );

        this.setupConnectionHandlers(this.primary);
        this.logManager.log("Primary connection initialized");
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(
          `Failed to initialize primary connection: ${errorMsg}`
        );
        throw new Error(
          `MongoDB connection initialization failed: ${errorMsg}`
        );
      }
    }
    return this.primary;
  }

  private setupConnectionHandlers(connection: mongoose.Connection): void {
    connection.on("connected", () => {
      this.reconnectAttempts = 0;
      this.logManager.log("MongoDB connected successfully");
    });

    connection.on("error", (err) => {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`MongoDB connection error: ${errorMsg}`);
      this.logManager.log(`Connection error: ${errorMsg}`);

      if (!this.isShuttingDown) {
        this.handleConnectionError(err);
      }
    });

    connection.on("disconnected", () => {
      this.logManager.log("MongoDB disconnected");

      if (
        !this.isShuttingDown &&
        this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS
      ) {
        this.attemptReconnect();
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

  private handleConnectionError(error: Error): void {
    this.logManager.log(`Handling connection error: ${error.message}`);

    // Critical errors that shouldn't retry
    if (
      error.message.includes("authentication failed") ||
      error.message.includes("not authorized")
    ) {
      this.logManager.log(
        "Authentication error - stopping reconnection attempts"
      );
      return;
    }

    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.attemptReconnect();
    } else {
      this.logManager.log("Max reconnection attempts reached");
    }
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.RECONNECT_INTERVAL * this.reconnectAttempts;

    this.logManager.log(
      `Attempting reconnection ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${delay}ms`
    );

    setTimeout(() => {
      if (!this.isShuttingDown && this.primary) {
        this.logManager.log("Reconnecting to MongoDB...");
        // Mongoose handles reconnection automatically, just log the attempt
      }
    }, delay);
  }

  getConnection(dbName: string = "default"): mongoose.Connection {
    if (this.isShuttingDown) {
      throw new Error("Cannot get connection: system is shutting down");
    }

    if (this.connections.has(dbName)) {
      this.logManager.log(`Using cached connection for database: ${dbName}`);
      return this.connections.get(dbName)!;
    }

    try {
      const primary = this.initPrimary();
      this.logManager.log(`Creating new connection for database: ${dbName}`);
      const conn = primary.useDb(dbName, { useCache: true });
      this.connections.set(dbName, conn);
      return conn;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(
        `Failed to get connection for ${dbName}: ${errorMsg}`
      );
      throw new Error(`Failed to establish database connection: ${errorMsg}`);
    }
  }

  async closeAll(): Promise<void> {
    this.logManager.log("Closing all non-essential connections");
    // Graceful close - allows in-flight operations to complete
    if (this.primary && this.primary.readyState === 1) {
      try {
        await this.primary.close(false);
        this.logManager.log("All connections closed gracefully");
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Error closing connections: ${errorMsg}`);
        throw error;
      }
    }
  }

  async forceCloseAll(): Promise<void> {
    this.isShuttingDown = true;
    this.logManager.log("Force closing all connections");

    if (this.primary) {
      try {
        await this.primary.close(true); // Force close
        this.primary = null;
        this.connections.clear();
        this.logManager.log("All connections force closed successfully");
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Error force closing connections: ${errorMsg}`);
        throw new Error(`Failed to close connections: ${errorMsg}`);
      }
    }
  }

  isConnected(): boolean {
    return this.primary !== null && this.primary.readyState === 1;
  }

  getReadyState(): string {
    if (!this.primary) return "not initialized";

    const states: Record<number, string> = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    return states[this.primary.readyState] || "unknown";
  }
}
