// src/Engine/Wrapper.ts
import * as mongoose from "mongoose";
import { PolyMongoOptions, WrappedModel, ConnectionStats } from "../types";
import { ConnectionManager } from "./Manager/ConnectionManager";
import { WatchManager } from "./Manager/WatchManager";
import { LogManager } from "./Manager/LogManager";

export class PolyMongoWrapper {
  private mongoURI: string;
  private defaultDB: string;
  private maxPoolSize: number;
  private minFreeConnections: number;
  private idleTimeoutMS: number | undefined;
  private debug: boolean;
  private connectionManager: ConnectionManager;
  private watchManager: WatchManager;
  private logManager: LogManager;

  constructor(options: PolyMongoOptions) {
    try {
      this.validateOptions(options);

      this.mongoURI = options.mongoURI;
      this.defaultDB = options.defaultDB ?? 'default';
      this.maxPoolSize = options.maxPoolSize ?? 10;
      this.minFreeConnections = options.minFreeConnections ?? 0;
      this.idleTimeoutMS = options.idleTimeoutMS ?? undefined;
      this.debug = options.debug ?? false;

      this.logManager = new LogManager(this.debug, options.logPath);
      this.connectionManager = new ConnectionManager(
        this.mongoURI,
        this.maxPoolSize,
        this.minFreeConnections,
        this.idleTimeoutMS,
        this.logManager,
      );
      this.watchManager = new WatchManager(this.logManager);

      this.logManager.log(
        `Creating PolyMongoWrapper with options: ${JSON.stringify(options)}`,
      );

      const coldStart = options.coldStart ?? true;

      if (!coldStart) {
        this.logManager.log("Eager initializing primary connection");
        this.connectionManager.initPrimary();
      } else {
        this.logManager.log(
          "Cold start enabled - connection will initialize on first query",
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to initialize PolyMongoWrapper: ${errorMsg}`);
    }
  }

  private validateOptions(options: PolyMongoOptions): void {
    if (!options.mongoURI) {
      throw new Error("mongoURI is required");
    }

    if (typeof options.mongoURI !== "string") {
      throw new Error("mongoURI must be a string");
    }

    if (
      !options.mongoURI.startsWith("mongodb://") &&
      !options.mongoURI.startsWith("mongodb+srv://")
    ) {
      throw new Error("mongoURI must start with mongodb:// or mongodb+srv://");
    }

    if (
      options.maxPoolSize !== undefined &&
      (typeof options.maxPoolSize !== "number" || options.maxPoolSize < 1)
    ) {
      throw new Error("maxPoolSize must be a positive number");
    }

    if (
      options.minFreeConnections !== undefined &&
      (typeof options.minFreeConnections !== "number" ||
        options.minFreeConnections < 0)
    ) {
      throw new Error("minFreeConnections must be a non-negative number");
    }

    if (
      options.idleTimeoutMS !== undefined &&
      (typeof options.idleTimeoutMS !== "number" || options.idleTimeoutMS < 0)
    ) {
      throw new Error("idleTimeoutMS must be a non-negative number");
    }

    if (
      options.minFreeConnections !== undefined &&
      options.maxPoolSize !== undefined &&
      options.minFreeConnections > options.maxPoolSize
    ) {
      throw new Error("minFreeConnections cannot be greater than maxPoolSize");
    }
  }

  wrapModel<T extends mongoose.Document>(
    baseModel: mongoose.Model<T>,
  ): WrappedModel<T> {
    const wrapper = this;

    if (!baseModel || !baseModel.modelName || !baseModel.schema) {
      throw new Error("Invalid model provided to wrapModel");
    }

    const getModelForDB = (dbName: string): mongoose.Model<T> => {
      try {
        wrapper.logManager.log(
          `Accessing model ${baseModel.modelName} for database: ${dbName}`,
        );

        const conn = wrapper.connectionManager.getConnection(dbName);
        const model = conn.model<T>(baseModel.modelName, baseModel.schema);

        const originalWatch = model.watch.bind(model);
        model.watch = function (...args: any[]) {
          try {
            const stream = originalWatch(...args);
            wrapper.watchManager.addStream(dbName, stream);

            stream.on("close", () => {
              wrapper.watchManager.removeStream(dbName, stream);
            });

            stream.on("error", (error) => {
              wrapper.logManager.log(
                `Watch stream error for ${dbName}: ${error.message}`,
              );
              wrapper.watchManager.removeStream(dbName, stream);
            });

            return stream;
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : "Unknown error";
            wrapper.logManager.log(
              `Failed to create watch stream: ${errorMsg}`,
            );
            throw new Error(`Failed to create watch stream: ${errorMsg}`);
          }
        } as any;

        return model;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        wrapper.logManager.log(
          `Error accessing model ${baseModel.modelName} for ${dbName}: ${errorMsg}`,
        );
        throw new Error(`Failed to access model: ${errorMsg}`);
      }
    };

    // Create a Proxy that intercepts all property access
    const wrappedModel = new Proxy(
      {
        db: (dbName?: string): mongoose.Model<T> => {
          return getModelForDB(dbName ?? wrapper.defaultDB);
        },
      } as any,
      {
        get(target, prop) {
          // If accessing 'db' method, return it
          if (prop === 'db') {
            return target.db;
          }

          // For any other property/method, get the default model and access it
          const defaultModel = getModelForDB(wrapper.defaultDB);
          const value = (defaultModel as any)[prop];

          // If it's a function, bind it to the model
          if (typeof value === 'function') {
            return value.bind(defaultModel);
          }

          return value;
        },
      }
    );

    return wrappedModel as WrappedModel<T>;
  }

  stats(): ConnectionStats {
    try {
      const stats: ConnectionStats = {
        activeConnections: this.connectionManager.connections.size,
        databases: Array.from(this.connectionManager.connections.keys()),
        poolStats: this.connectionManager.primary?.getClient()
          ? {
            totalConnections:
              (this.connectionManager.primary?.getClient() as any)?.s?.pool
                ?.totalConnectionCount || 0,
            maxPoolSize: this.maxPoolSize,
            minFreeConnections: this.minFreeConnections,
            idleTimeoutMS: this.idleTimeoutMS,
          }
          : null,
      };
      this.logManager.log(`Connection stats: ${JSON.stringify(stats)}`);
      return stats;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error getting stats: ${errorMsg}`);
      throw new Error(`Failed to retrieve connection stats: ${errorMsg}`);
    }
  }

  async closeAll(): Promise<void> {
    try {
      this.logManager.log("Wrapper closeAll called");
      this.watchManager.closeAllWatches();
      await this.connectionManager.closeAll();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error in closeAll: ${errorMsg}`);
      throw new Error(`Failed to close connections: ${errorMsg}`);
    }
  }

  async forceCloseAll(): Promise<void> {
    try {
      this.logManager.log("Wrapper forceCloseAll called");
      this.watchManager.closeAllWatches();
      await this.connectionManager.forceCloseAll();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error in forceCloseAll: ${errorMsg}`);
      throw new Error(`Failed to force close connections: ${errorMsg}`);
    }
  }

  closeDBstream(dbName: string): void {
    try {
      this.logManager.log(`Wrapper closeDBstream called for ${dbName}`);
      this.watchManager.closeDBstream(dbName);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error closing DB stream: ${errorMsg}`);
      throw new Error(`Failed to close database stream: ${errorMsg}`);
    }
  }

  closeAllWatches(): void {
    try {
      this.logManager.log("Wrapper closeAllWatches called");
      this.watchManager.closeAllWatches();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error closing watches: ${errorMsg}`);
      throw new Error(`Failed to close watches: ${errorMsg}`);
    }
  }

  async dropDatabase(dbName: string): Promise<void> {
    try {
      this.logManager.log(`Dropping database: ${dbName}`);
      const conn = this.connectionManager.getConnection(dbName);
      await conn.dropDatabase();
      this.connectionManager.connections.delete(dbName);
      this.watchManager.closeDBstream(dbName);
      this.logManager.log(`Database ${dbName} dropped successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error dropping database ${dbName}: ${errorMsg}`);
      throw new Error(`Failed to drop database: ${errorMsg}`);
    }
  }

  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  getConnectionState(): string {
    return this.connectionManager.getReadyState();
  }

  async transaction<T>(
    fn: (session: mongoose.ClientSession) => Promise<T>,
    options?: mongoose.mongo.TransactionOptions
  ): Promise<T> {
    try {
      this.logManager.log("Starting transaction");

      // Ensure primary connection is initialized
      const primary = this.connectionManager.initPrimary();

      // Start session and transaction
      const session = await primary.startSession();

      try {
        session.startTransaction(options);

        const result = await fn(session);

        await session.commitTransaction();
        this.logManager.log("Transaction committed successfully");

        return result;
      } catch (error) {
        await session.abortTransaction();
        this.logManager.log(
          `Transaction aborted: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        throw error;
      } finally {
        await session.endSession();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Transaction failed: ${errorMsg}`);
      throw new Error(`Transaction failed: ${errorMsg}`);
    }
  }
}