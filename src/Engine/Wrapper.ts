import * as mongoose from "mongoose";
import { PolyMongoOptions, WrappedModel } from "../types";
import { ConnectionManager } from "./managers/ConnectionManager";
import { HookManager } from "./managers/HookManager";
import { LogManager } from "./managers/LogManager";
import { WatchManager } from "./managers/WatchManager";
import { validateOptions } from "./utils/Validators";
import { StatsService } from "./services/StatsService";
import { ScaleService } from "./services/ScaleService";
import { DBSpecificConfig } from "../types/scale.types";

export class PolyMongoWrapper {
  private mongoURI: string;
  private defaultDB: string;
  private maxPoolSize: number;
  private minFreeConnections: number;
  private idleTimeoutMS: number | undefined;
  private debug: boolean;
  private connectionManager: ConnectionManager;
  private hookManager: HookManager;
  private logManager: LogManager;
  private watchManager: WatchManager;
  private dbSpecificConfigs?: DBSpecificConfig[];
  private statsService: StatsService;
  private scaleService: ScaleService;

  // Transaction context for tdb operations
  private transactionContext: {
    active: boolean;
    operations: Array<{ undo: () => Promise<void> }>;
  } = { active: false, operations: [] };

  public stats: {
    general: () => any;
    db: (dbName?: string) => Promise<any>;
    listDatabases: (dbName?: string) => Promise<any>;
  };
  public scale: {
    connectDB: (dbNames: string[], options?: any) => Promise<void>;
    setDB: (dbNames: string[], options?: any) => void;
  };

  constructor(options: PolyMongoOptions) {
    try {
      validateOptions(options);
      this.hookManager = new HookManager();
      this.mongoURI = options.mongoURI;
      this.defaultDB = options.defaultDB ?? "default";
      this.maxPoolSize = options.maxPoolSize ?? 10;
      this.minFreeConnections = options.minFreeConnections ?? 0;
      this.idleTimeoutMS = options.idleTimeoutMS ?? undefined;
      this.debug = options.debug ?? false;

      this.logManager = new LogManager(this.debug, options.logPath);
      this.dbSpecificConfigs = options.dbSpecific;

      this.connectionManager = new ConnectionManager(
        this.mongoURI,
        this.maxPoolSize,
        this.minFreeConnections,
        this.idleTimeoutMS,
        this.logManager,
        this.dbSpecificConfigs,
        this.hookManager.hooks
      );

      this.watchManager = new WatchManager(this.logManager);
      this.statsService = new StatsService(
        this.connectionManager,
        this.logManager,
        this.getPoolStats.bind(this),
        this.defaultDB
      );
      this.scaleService = new ScaleService(
        this.connectionManager,
        this.logManager
      );

      this.stats = {
        general: this.statsService.general.bind(this.statsService),
        db: this.statsService.db.bind(this.statsService),
        listDatabases: this.statsService.listDatabases.bind(this.statsService),
      };

      this.scale = {
        connectDB: this.scaleService.connectDB.bind(this.scaleService),
        setDB: this.scaleService.setDB.bind(this.scaleService),
      };

      this.logManager.log(
        `Creating PolyMongoWrapper with options: ${JSON.stringify(options)}`
      );

      const coldStart = options.coldStart ?? true;

      if (!coldStart) {
        this.logManager.log("Eager initializing primary connection");
        this.connectionManager.initPrimary();
      } else {
        this.logManager.log(
          "Cold start enabled - connection will initialize on first query"
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to initialize PolyMongoWrapper: ${errorMsg}`);
    }
  }

  public onDbConnect(callback: (db: mongoose.Connection) => void): void {
    this.hookManager.onDbConnect(callback);
  }

  public onDbDisconnect(callback: (db: mongoose.Connection) => void): void {
    this.hookManager.onDbDisconnect(callback);
  }

  public onTheseDBConnect(
    dbNames: string[],
    callback: (db: mongoose.Connection) => void
  ): void {
    this.hookManager.onTheseDBConnect(dbNames, callback);
  }

  public onTheseDBDisconnect(
    dbNames: string[],
    callback: (db: mongoose.Connection) => void
  ): void {
    this.hookManager.onTheseDBDisconnect(dbNames, callback);
  }

  wrapModel<T extends mongoose.Document>(
    baseModel: mongoose.Model<T>
  ): WrappedModel<T> {
    const wrapper = this;

    if (!baseModel || !baseModel.modelName || !baseModel.schema) {
      throw new Error("Invalid model provided to wrapModel");
    }

    const getModelForDB = (dbName: string): mongoose.Model<T> => {
      try {
        wrapper.logManager.log(
          `Accessing model ${baseModel.modelName} for database: ${dbName}`
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
                `Watch stream error for ${dbName}: ${error.message}`
              );
              wrapper.watchManager.removeStream(dbName, stream);
            });

            return stream;
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : "Unknown error";
            wrapper.logManager.log(
              `Failed to create watch stream: ${errorMsg}`
            );
            throw new Error(`Failed to create watch stream: ${errorMsg}`);
          }
        } as any;

        return model;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        wrapper.logManager.log(
          `Error accessing model ${baseModel.modelName} for ${dbName}: ${errorMsg}`
        );
        throw new Error(`Failed to access model: ${errorMsg}`);
      }
    };

    const createTransactionalProxy = (dbName: string): any => {
      const model = getModelForDB(dbName);

      return new Proxy(model, {
        get(target, prop) {
          const original = (target as any)[prop];

          if (typeof original !== "function") return original;

          return async function (...args: any[]) {
            if (!wrapper.transactionContext.active) {
              throw new Error("tdb can only be used inside safeTransaction");
            }

            // Handle create/insertMany operations
            if (prop === "create" || prop === "insertMany") {
              const result = await original.apply(target, args);
              const ids = Array.isArray(result)
                ? result.map((r: any) => r._id)
                : [result._id];

              wrapper.transactionContext.operations.push({
                undo: async () => {
                  await model.deleteMany({ _id: { $in: ids } });
                  wrapper.logManager.log(
                    `Rolled back ${prop} for ${baseModel.modelName} in ${dbName}`
                  );
                },
              });

              wrapper.logManager.log(
                `Tracked ${prop} operation for ${baseModel.modelName} in ${dbName}`
              );
              return result;
            }

            // Handle update operations
            if (
              prop === "updateOne" ||
              prop === "updateMany" ||
              prop === "findOneAndUpdate"
            ) {
              const filter = args[0];
              const originals = await model.find(filter).lean();
              const result = await original.apply(target, args);

              if (originals.length > 0) {
                wrapper.transactionContext.operations.push({
                  undo: async () => {
                    for (const doc of originals) {
                      await model.replaceOne({ _id: doc._id }, doc);
                    }
                    wrapper.logManager.log(
                      `Rolled back ${prop} for ${baseModel.modelName} in ${dbName}`
                    );
                  },
                });

                wrapper.logManager.log(
                  `Tracked ${prop} operation for ${baseModel.modelName} in ${dbName}`
                );
              }

              return result;
            }

            // Handle delete operations
            if (
              prop === "deleteOne" ||
              prop === "deleteMany" ||
              prop === "findOneAndDelete"
            ) {
              const filter = args[0];
              const originals = await model.find(filter).lean();
              const result = await original.apply(target, args);

              if (originals.length > 0) {
                wrapper.transactionContext.operations.push({
                  undo: async () => {
                    await model.insertMany(originals);
                    wrapper.logManager.log(
                      `Rolled back ${prop} for ${baseModel.modelName} in ${dbName}`
                    );
                  },
                });

                wrapper.logManager.log(
                  `Tracked ${prop} operation for ${baseModel.modelName} in ${dbName}`
                );
              }

              return result;
            }

            // For read operations or other methods, just execute normally
            return await original.apply(target, args);
          };
        },
      });
    };

    // Create a Proxy that intercepts all property access
    const wrappedModel = new Proxy(
      {
        db: (dbName?: string): mongoose.Model<T> => {
          return getModelForDB(dbName ?? wrapper.defaultDB);
        },
        tdb: (dbName?: string): any => {
          const targetDB = dbName ?? wrapper.defaultDB;
          return createTransactionalProxy(targetDB);
        },
      } as any,
      {
        get(target, prop) {
          // If accessing 'db' or 'tdb' method, return it
          if (prop === "db" || prop === "tdb") {
            return target[prop];
          }

          // For any other property/method, get the default model and access it
          const defaultModel = getModelForDB(wrapper.defaultDB);
          const value = (defaultModel as any)[prop];

          // If it's a function, bind it to the model
          if (typeof value === "function") {
            return value.bind(defaultModel);
          }

          return value;
        },
      }
    );

    return wrappedModel as WrappedModel<T>;
  }

  private getPoolStats(conn: mongoose.Connection | null): any {
    if (!conn) return null;
    const client = conn.getClient() as any;
    const pool = client?.s?.pool;
    if (!pool) return null;

    return {
      totalConnections:
        pool.totalConnectionCount ?? pool.totalCreatedConnectionCount ?? 0,
      availableConnections:
        pool.availableConnectionCount ?? pool.totalAvailableCount ?? 0,
      inUseConnections: pool.inUseConnectionCount ?? pool.totalInUseCount ?? 0,
      waitQueueSize:
        pool.waitQueueSize ??
        pool.waitingClientsCount ??
        pool.waitQueueMemberCount ??
        0,
      maxPoolSize: pool.maxPoolSize ?? this.maxPoolSize ?? 0,
      minPoolSize: pool.minPoolSize ?? this.minFreeConnections ?? 0,
      maxIdleTimeMS: pool.maxIdleTimeMS ?? this.idleTimeoutMS,
    };
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
      const primary = this.connectionManager.initPrimary();
      const session = await primary.startSession();

      try {
        const result = await session.withTransaction(async () => {
          return await fn(session);
        }, options);

        this.logManager.log("Transaction committed successfully");
        return result;
      } finally {
        await session.endSession();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Transaction failed: ${errorMsg}`);
      throw new Error(`Transaction failed: ${errorMsg}`);
    }
  }

  async safeTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.transactionContext.active) {
      throw new Error("Nested transactions are not supported");
    }

    this.transactionContext = { active: true, operations: [] };
    this.logManager.log("Starting safe transaction with rollback support");

    try {
      const result = await fn();
      this.logManager.log(
        `Safe transaction completed successfully with ${this.transactionContext.operations.length} tracked operations`
      );
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(
        `Safe transaction failed: ${errorMsg}. Rolling back ${this.transactionContext.operations.length} operations...`
      );

      // Rollback in reverse order
      for (let i = this.transactionContext.operations.length - 1; i >= 0; i--) {
        try {
          await this.transactionContext.operations[i].undo();
        } catch (rollbackError) {
          const rollbackMsg =
            rollbackError instanceof Error
              ? rollbackError.message
              : "Unknown error";
          this.logManager.log(`Rollback operation ${i} failed: ${rollbackMsg}`);
        }
      }

      this.logManager.log("Rollback completed");
      throw new Error(`Safe transaction failed: ${errorMsg}`);
    } finally {
      this.transactionContext = { active: false, operations: [] };
    }
  }

  public bulkTasks = {
    copyDatabase: async (sourceDB: string, targetDB: string): Promise<void> => {
      try {
        this.logManager.log(`Copying database from ${sourceDB} to ${targetDB}`);

        const sourceConn = this.connectionManager.getConnection(sourceDB);
        const targetConn = this.connectionManager.getConnection(targetDB);

        // Wait for connections to be ready
        await new Promise<void>((resolve, reject) => {
          if (sourceConn.readyState === 1) {
            resolve();
          } else {
            sourceConn.once("open", () => resolve());
            sourceConn.once("error", reject);
          }
        });

        await new Promise<void>((resolve, reject) => {
          if (targetConn.readyState === 1) {
            resolve();
          } else {
            targetConn.once("open", () => resolve());
            targetConn.once("error", reject);
          }
        });

        if (!sourceConn.db || !targetConn.db) {
          throw new Error("Database connection not ready");
        }

        const collections = await sourceConn.db.listCollections().toArray();

        for (const collInfo of collections) {
          const collName = collInfo.name;
          this.logManager.log(`Copying collection: ${collName}`);

          const docs = await sourceConn.db
            .collection(collName)
            .find({})
            .toArray();

          if (docs.length > 0) {
            await targetConn.db.collection(collName).insertMany(docs);
          }

          const indexes = await sourceConn.db.collection(collName).indexes();
          for (const index of indexes) {
            if (index.name !== "_id_") {
              const { name, ...indexSpec } = index;
              await targetConn.db
                .collection(collName)
                .createIndex(indexSpec.key, { name, ...indexSpec });
            }
          }
        }

        this.logManager.log(`Database copied from ${sourceDB} to ${targetDB}`);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Error copying database: ${errorMsg}`);
        throw new Error(`Failed to copy database: ${errorMsg}`);
      }
    },

    dropDatabase: async (dbName: string): Promise<void> => {
      try {
        if (!dbName) {
          throw new Error("Database name is required to drop a database");
        }
        this.logManager.log(`Dropping database: ${dbName}`);
        const conn = this.connectionManager.getConnection(dbName);
        await conn.dropDatabase();
        this.connectionManager.connections.delete(dbName);
        this.watchManager.closeDBstream(dbName);
        this.logManager.log(`Database ${dbName} dropped successfully`);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Error dropping database ${dbName}: ${errorMsg}`);
        throw new Error(`Failed to drop database: ${errorMsg}`);
      }
    },

    export: async (dbName: string): Promise<any> => {
      try {
        this.logManager.log(`Exporting database: ${dbName}`);

        const conn = this.connectionManager.getConnection(dbName);

        // Wait for connection
        await new Promise<void>((resolve, reject) => {
          if (conn.readyState === 1) {
            resolve();
          } else {
            conn.once("open", () => resolve());
            conn.once("error", reject);
          }
        });

        if (!conn.db) {
          throw new Error("Database connection not ready");
        }

        const collections = await conn.db.listCollections().toArray();
        const exportData: any = {
          database: dbName,
          exportDate: new Date().toISOString(),
          collections: {},
        };

        for (const collInfo of collections) {
          const collName = collInfo.name;
          this.logManager.log(`Exporting collection: ${collName}`);

          const docs = await conn.db.collection(collName).find({}).toArray();
          const indexes = await conn.db.collection(collName).indexes();

          exportData.collections[collName] = {
            documents: docs,
            indexes: indexes,
          };
        }

        this.logManager.log(`Database ${dbName} exported successfully`);
        return exportData;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Error exporting database: ${errorMsg}`);
        throw new Error(`Failed to export database: ${errorMsg}`);
      }
    },

    import: async (dbName: string, data: any): Promise<void> => {
      try {
        this.logManager.log(`Importing database to: ${dbName}`);

        if (!data.collections || typeof data.collections !== "object") {
          throw new Error("Invalid import data format");
        }

        const conn = this.connectionManager.getConnection(dbName);

        // Wait for connection
        await new Promise<void>((resolve, reject) => {
          if (conn.readyState === 1) {
            resolve();
          } else {
            conn.once("open", () => resolve());
            conn.once("error", reject);
          }
        });

        if (!conn.db) {
          throw new Error("Database connection not ready");
        }

        for (const [collName, collData] of Object.entries(
          data.collections as any
        )) {
          this.logManager.log(`Importing collection: ${collName}`);

          const { documents, indexes } = collData as any;

          if (documents && documents.length > 0) {
            await conn.db.collection(collName).insertMany(documents);
          }

          if (indexes && Array.isArray(indexes)) {
            for (const index of indexes) {
              if (index.name !== "_id_") {
                const { name, ...indexSpec } = index;
                await conn.db
                  .collection(collName)
                  .createIndex(indexSpec.key, { name, ...indexSpec });
              }
            }
          }
        }

        this.logManager.log(`Database imported to ${dbName} successfully`);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Error importing database: ${errorMsg}`);
        throw new Error(`Failed to import database: ${errorMsg}`);
      }
    },
    exportStream: (dbName: string): NodeJS.ReadableStream => {
      const { Readable } = require("stream");

      const stream = new Readable({
        objectMode: false,
        async read() {},
      });

      (async () => {
        try {
          this.logManager.log(`Starting stream export for: ${dbName}`);

          const conn = this.connectionManager.getConnection(dbName);

          await new Promise<void>((resolve, reject) => {
            if (conn.readyState === 1) resolve();
            else {
              conn.once("open", () => resolve());
              conn.once("error", reject);
            }
          });

          if (!conn.db) throw new Error("Database connection not ready");

          // Start JSON structure
          stream.push(
            '{"database":"' +
              dbName +
              '","exportDate":"' +
              new Date().toISOString() +
              '","collections":{'
          );

          const collections = await conn.db.listCollections().toArray();

          for (let i = 0; i < collections.length; i++) {
            const collName = collections[i].name;
            this.logManager.log(`Streaming collection: ${collName}`);

            if (i > 0) stream.push(",");
            stream.push('"' + collName + '":{"documents":[');

            // Stream documents
            const cursor = conn.db.collection(collName).find({});
            let first = true;

            for await (const doc of cursor) {
              if (!first) stream.push(",");
              stream.push(JSON.stringify(doc));
              first = false;
            }

            stream.push('],"indexes":');
            const indexes = await conn.db.collection(collName).indexes();
            stream.push(JSON.stringify(indexes));
            stream.push("}");
          }

          stream.push("}}");
          stream.push(null);

          this.logManager.log(`Stream export completed for: ${dbName}`);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          this.logManager.log(`Error in stream export: ${errorMsg}`);
          stream.destroy(new Error(`Export stream failed: ${errorMsg}`));
        }
      })();

      return stream;
    },

    importStream: async (
      dbName: string,
      stream: NodeJS.ReadableStream
    ): Promise<void> => {
      return new Promise(async (resolve, reject) => {
        try {
          this.logManager.log(`Starting stream import to: ${dbName}`);

          const conn = this.connectionManager.getConnection(dbName);

          await new Promise<void>((resolveConn, rejectConn) => {
            if (conn.readyState === 1) resolveConn();
            else {
              conn.once("open", () => resolveConn());
              conn.once("error", rejectConn);
            }
          });

          if (!conn.db) throw new Error("Database connection not ready");

          let buffer = "";

          stream.on("data", (chunk) => {
            buffer += chunk.toString();
          });

          stream.on("end", async () => {
            try {
              const data = JSON.parse(buffer);

              if (!data.collections || typeof data.collections !== "object") {
                throw new Error("Invalid import data format");
              }

              for (const [collName, collData] of Object.entries(
                data.collections as any
              )) {
                this.logManager.log(`Importing collection: ${collName}`);

                const { documents, indexes } = collData as any;

                if (documents && documents.length > 0) {
                  // Insert in batches to handle large collections
                  const batchSize = 1000;
                  for (let i = 0; i < documents.length; i += batchSize) {
                    const batch = documents.slice(i, i + batchSize);
                    await conn.db!.collection(collName).insertMany(batch);
                  }
                }

                if (indexes && Array.isArray(indexes)) {
                  for (const index of indexes) {
                    if (index.name !== "_id_") {
                      const { name, ...indexSpec } = index;
                      await conn
                        .db!.collection(collName)
                        .createIndex(indexSpec.key, { name, ...indexSpec });
                    }
                  }
                }
              }

              this.logManager.log(`Stream import completed for: ${dbName}`);
              resolve();
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : "Unknown error";
              this.logManager.log(
                `Error processing import stream: ${errorMsg}`
              );
              reject(new Error(`Import stream failed: ${errorMsg}`));
            }
          });

          stream.on("error", (error) => {
            this.logManager.log(`Stream error: ${error.message}`);
            reject(new Error(`Import stream failed: ${error.message}`));
          });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          this.logManager.log(`Error in stream import: ${errorMsg}`);
          reject(new Error(`Failed to import stream: ${errorMsg}`));
        }
      });
    },
  };

  public actions = {
    closeAll: async (): Promise<void> => {
      try {
        this.logManager.log("Actions closeAll called");
        this.watchManager.closeAllWatches();
        await this.connectionManager.closeAll();
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Error in actions.closeAll: ${errorMsg}`);
        throw new Error(`Failed to close connections: ${errorMsg}`);
      }
    },

    forceCloseAll: async (): Promise<void> => {
      try {
        this.logManager.log("Actions forceCloseAll called");
        this.watchManager.closeAllWatches();
        await this.connectionManager.forceCloseAll();
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Error in actions.forceCloseAll: ${errorMsg}`);
        throw new Error(`Failed to force close connections: ${errorMsg}`);
      }
    },

    closeDBstream: (dbName: string): void => {
      try {
        this.logManager.log(`Actions closeDBstream called for ${dbName}`);
        this.watchManager.closeDBstream(dbName);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Error closing DB stream: ${errorMsg}`);
        throw new Error(`Failed to close database stream: ${errorMsg}`);
      }
    },

    closeAllWatches: (): void => {
      try {
        this.logManager.log("Actions closeAllWatches called");
        this.watchManager.closeAllWatches();
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(`Error closing watches: ${errorMsg}`);
        throw new Error(`Failed to close watches: ${errorMsg}`);
      }
    },
  };
}
