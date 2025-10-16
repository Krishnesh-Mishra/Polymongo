// src/Engine/Manager/ConnectionManager.ts
import * as mongoose from "mongoose";
import { LogManager } from "./LogManager";
import { DBSpecificConfig, ConnectionPoolInfo, ScaleOptions, PoolStats } from "../../types/scale.types";

export class ConnectionManager {
  primary: mongoose.Connection | null = null;
  connections: Map<string, mongoose.Connection> = new Map();
  private isShuttingDown: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_INTERVAL = 5000;
  public dbConfigs: Map<string, DBSpecificConfig['options'] & { mongoURI?: string }> = new Map();
  public separateConnections: Map<string, ConnectionPoolInfo> = new Map();


  constructor(
    public mongoURI: string,
    private maxPoolSize: number,
    private minFreeConnections: number,
    private idleTimeoutMS: number | undefined,
    private logManager: LogManager,
    dbSpecificConfigs?: DBSpecificConfig[],
    private hooks?: {
      onDbConnect: Array<(db: mongoose.Connection) => void>;
      onDbDisconnect: Array<(db: mongoose.Connection) => void>;
      onTheseDBConnect: Map<string, Array<(db: mongoose.Connection) => void>>;
      onTheseDBDisconnect: Map<string, Array<(db: mongoose.Connection) => void>>;
    }
  ) {
    if (dbSpecificConfigs) {
      dbSpecificConfigs.forEach(config => {
        const cleanURI = config.mongoURI ? this.cleanMongoURI(config.mongoURI) : undefined;
        this.dbConfigs.set(config.dbName, {
          ...config.options,
          mongoURI: cleanURI
        });

        // If coldStart is false for this DB, initialize it immediately
        if (config.options.coldStart === false) {
          this.logManager.log(`Eager initializing connection for ${config.dbName}`);
          this.connectDB([config.dbName], config.options).catch(err => {
            this.logManager.log(`Failed to eager init ${config.dbName}: ${err.message}`);
          });
        }
      });
    }

    this.setupGracefulShutdown();
  }

  public lastAccessedDbs: Map<string, number> = new Map();

  public getPoolStats(conn: mongoose.Connection | null): PoolStats | null {
    if (!conn) return null;
    const client = conn.getClient() as any;
    const pool = client?.s?.pool;
    if (!pool) return null;

    return {
      totalConnections: pool.totalConnectionCount ?? pool.totalCreatedConnectionCount ?? 0,
      availableConnections: pool.availableConnectionCount ?? pool.totalAvailableCount ?? 0,
      inUseConnections: pool.inUseConnectionCount ?? pool.totalInUseCount ?? 0,
      waitQueueSize: pool.waitQueueSize ?? pool.waitingClientsCount ?? pool.waitQueueMemberCount ?? 0,
      maxPoolSize: pool.maxPoolSize ?? this.maxPoolSize ?? 0,
      minPoolSize: pool.minPoolSize ?? this.minFreeConnections ?? 0,
      maxIdleTimeMS: pool.maxIdleTimeMS ?? this.idleTimeoutMS,
    };
  }

  private cleanMongoURI(uri: string): string {
    try {
      const url = new URL(uri);
      // Remove the pathname (which contains the database name)
      url.pathname = '/';
      const cleanedURI = url.toString().replace(/\/$/, ''); // Remove trailing slash
      this.logManager.log(`Cleaned URI from ${uri} to ${cleanedURI}`);
      return cleanedURI;
    } catch (error) {
      this.logManager.log(`Failed to parse URI ${uri}, using as-is`);
      return uri;
    }
  }

  public setDB(dbNames: string[], options?: ScaleOptions & { mongoURI?: string }): void {
    this.logManager.log(`setDB called for: ${dbNames.join(', ')}`);

    for (const dbName of dbNames) {
      const cleanURI = options?.mongoURI ? this.cleanMongoURI(options.mongoURI) : undefined;

      const config = {
        autoClose: options?.autoClose,
        ttl: options?.ttl,
        maxConnections: options?.maxConnections,
        coldStart: options?.coldStart ?? true,
        mongoURI: cleanURI
      };

      this.dbConfigs.set(dbName, config);
      this.logManager.log(
        `Configuration saved for ${dbName}: ${JSON.stringify(config)}`
      );

      // If coldStart is false, initialize connection immediately
      if (config.coldStart === false) {
        this.logManager.log(`Eager initializing connection for ${dbName} (coldStart=false)`);
        this.connectDB([dbName], options).catch(err => {
          this.logManager.log(`Failed to eager init ${dbName}: ${err.message}`);
        });
      }
    }
  }

  public async connectDB(dbNames: string[], options?: ScaleOptions): Promise<void> {
    this.logManager.log(`connectDB called for: ${dbNames.join(', ')}`);

    for (const dbName of dbNames) {
      if (this.separateConnections.has(dbName)) {
        const poolInfo = this.separateConnections.get(dbName)!;
        if (poolInfo.isInitialized) {
          this.logManager.log(`Connection already exists for ${dbName}, skipping`);
          continue;
        }
      }

      try {
        // Merge saved config with provided options
        const savedConfig = this.dbConfigs.get(dbName) || {};
        const config = { ...savedConfig, ...options };

        const mongoURI = config.mongoURI || this.mongoURI;
        const maxConnections = config.maxConnections || this.maxPoolSize;

        this.logManager.log(
          `Creating separate connection for ${dbName} with maxPoolSize=${maxConnections}, URI=${mongoURI}`
        );

        const connection = mongoose.createConnection(mongoURI, {
          dbName: dbName,
          maxPoolSize: maxConnections,
          minPoolSize: this.minFreeConnections,
          maxIdleTimeMS: this.idleTimeoutMS,
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          connectTimeoutMS: 10000,
        });

        this.setupConnectionHandlers(connection);

        const poolInfo: ConnectionPoolInfo = {
          dbName,
          connection,
          config,
          mongoURI: config.mongoURI,
          lastAccessed: Date.now(),
          isInitialized: true,
        };

        // Setup auto-close timer if enabled
        if (config.autoClose && config.ttl) {
          this.setupAutoCloseTimer(poolInfo);
        }

        this.separateConnections.set(dbName, poolInfo);
        this.logManager.log(`Separate connection created for ${dbName}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Failed to create connection for ${dbName}: ${errorMsg}`);
        throw new Error(`Failed to connect to ${dbName}: ${errorMsg}`);
      }
    }
  }

  private setupAutoCloseTimer(poolInfo: ConnectionPoolInfo): void {
    const closeConnection = async () => {
      const timeSinceAccess = Date.now() - poolInfo.lastAccessed;

      if (timeSinceAccess >= (poolInfo.config.ttl || 0)) {
        this.logManager.log(
          `Auto-closing idle connection for ${poolInfo.dbName} (idle for ${timeSinceAccess}ms)`
        );

        try {
          await poolInfo.connection.close();
          this.separateConnections.delete(poolInfo.dbName);
          this.logManager.log(`Connection ${poolInfo.dbName} auto-closed`);
        } catch (error) {
          this.logManager.log(
            `Error auto-closing ${poolInfo.dbName}: ${error instanceof Error ? error.message : "Unknown"}`
          );
        }
      } else {
        // Reschedule check
        poolInfo.timer = setTimeout(closeConnection, (poolInfo.config.ttl || 0) - timeSinceAccess);
      }
    };

    poolInfo.timer = setTimeout(closeConnection, poolInfo.config.ttl || 60000);
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
    process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2"));
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
      this.hooks?.onDbConnect.forEach(callback => callback(connection));
      const dbName = connection.name;
      this.hooks?.onTheseDBConnect.get(dbName)?.forEach(callback => callback(connection));
    });

    connection.on("error", (err) => {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`MongoDB connection error: ${errorMsg}`);
      this.logManager.log(`Connection error: ${errorMsg}`);

      if (!this.isShuttingDown) {
        this.handleConnectionError(err, connection);
      }
    });

    connection.on("disconnected", () => {
      this.logManager.log("MongoDB disconnected");
      const dbName = connection.name;
      this.hooks?.onTheseDBDisconnect.get(dbName)?.forEach(callback => callback(connection));
      if (!this.isShuttingDown && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
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

  private handleConnectionError(error: Error, connection?: mongoose.Connection, poolInfo?: ConnectionPoolInfo): void {
    this.logManager.log(`Handling connection error: ${error.message}`);

    if (error.message.includes("authentication failed") || error.message.includes("not authorized")) {
      this.logManager.log("Authentication error - stopping reconnection attempts");
      return;
    }

    if (connection && !poolInfo) {
      for (const [_, pInfo] of this.separateConnections.entries()) {
        if (pInfo.connection === connection) {
          poolInfo = pInfo;
          break;
        }
      }
    }

    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.attemptReconnect(poolInfo);
    } else {
      this.logManager.log("Max reconnection attempts reached");
    }
  }
  private attemptReconnect(poolInfo?: ConnectionPoolInfo): void {
    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.MAX_RECONNECT_ATTEMPTS) {
      this.logManager.log("Max reconnection attempts reached");
      return;
    }
    const delay = this.RECONNECT_INTERVAL * this.reconnectAttempts;
    this.logManager.log(`Attempting reconnection ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
    setTimeout(() => {
      if (this.isShuttingDown) return;
      this.logManager.log("Reconnecting to MongoDB...");
      if (poolInfo) {
        if (poolInfo.connection.readyState === 0) {
          try {
            poolInfo.connection = mongoose.createConnection(poolInfo.mongoURI || this.mongoURI, {
              dbName: poolInfo.dbName,
              maxPoolSize: poolInfo.config.maxConnections || this.maxPoolSize,
              minPoolSize: this.minFreeConnections,
              maxIdleTimeMS: this.idleTimeoutMS,
              serverSelectionTimeoutMS: 10000,
              socketTimeoutMS: 45000,
              connectTimeoutMS: 10000,
              bufferCommands: false,
            });
            this.setupConnectionHandlers(poolInfo.connection);
            this.logManager.log(`Separate connection for ${poolInfo.dbName} recreated`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            this.logManager.log(`Separate reconnect failed for ${poolInfo.dbName}: ${errorMsg}`);
            this.attemptReconnect(poolInfo);
          }
        }
      } else if (!this.primary || this.primary.readyState === 0) {
        try {
          this.primary = mongoose.createConnection(this.mongoURI, {
            maxPoolSize: this.maxPoolSize + 1,
            minPoolSize: this.minFreeConnections,
            maxIdleTimeMS: this.idleTimeoutMS,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 10000,
            bufferCommands: false,
          });
          this.setupConnectionHandlers(this.primary);
          this.logManager.log("Primary connection recreated");
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          this.logManager.log(`Reconnect failed: ${errorMsg}`);
          this.attemptReconnect();
        }
      }
    }, delay);
  }

  getConnection(dbName: string = "default"): mongoose.Connection {
    if (this.isShuttingDown) {
      throw new Error("Cannot get connection: system is shutting down");
    }
    this.lastAccessedDbs.set(dbName, Date.now());
    // Check if this db has a saved config but not initialized yet
    if (this.dbConfigs.has(dbName) && !this.separateConnections.has(dbName)) {
      const config = this.dbConfigs.get(dbName)!;
      this.logManager.log(
        `First access to ${dbName} with saved config, initializing connection`
      );

      // Initialize connection on first access (lazy loading)
      this.connectDB([dbName], config).catch(err => {
        this.logManager.log(`Failed to initialize ${dbName}: ${err.message}`);
        throw err;
      });
    }

    // Check if this db has a separate connection pool
    if (this.separateConnections.has(dbName)) {
      const poolInfo = this.separateConnections.get(dbName)!;

      // Wait for initialization if not ready
      if (!poolInfo.isInitialized) {
        throw new Error(`Connection for ${dbName} is still initializing`);
      }

      poolInfo.lastAccessed = Date.now();

      // Reset auto-close timer
      if (poolInfo.config.autoClose && poolInfo.config.ttl) {
        if (poolInfo.timer) {
          clearTimeout(poolInfo.timer);
        }
        this.setupAutoCloseTimer(poolInfo);
      }

      this.logManager.log(`Using separate connection pool for database: ${dbName}`);
      return poolInfo.connection;
    }

    // Existing useDb logic for databases without separate pools
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
      this.logManager.log(`Failed to get connection for ${dbName}: ${errorMsg}`);
      throw new Error(`Failed to establish database connection: ${errorMsg}`);
    }
  }

  async closeAll(): Promise<void> {
    this.logManager.log("Closing all non-essential connections");
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

    // Close separate connections first
    for (const [dbName, poolInfo] of this.separateConnections.entries()) {
      if (poolInfo.timer) {
        clearTimeout(poolInfo.timer);
      }
      try {
        await poolInfo.connection.close(true);
        this.logManager.log(`Separate connection ${dbName} closed`);
      } catch (error) {
        this.logManager.log(
          `Error closing separate connection ${dbName}: ${error instanceof Error ? error.message : "Unknown"}`
        );
      }
    }
    this.separateConnections.clear();

    // Close primary connection
    if (this.primary) {
      try {
        await this.primary.close(true);
        this.primary = null;
        this.connections.clear();
        this.logManager.log("All connections force closed successfully");
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Error force closing connections: ${errorMsg}`);
        throw new Error(`Failed to close connections: ${errorMsg}`);
      }
    }
  }

  public get separateConnectionsInfo(): Map<string, ConnectionPoolInfo> {
    return this.separateConnections;
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