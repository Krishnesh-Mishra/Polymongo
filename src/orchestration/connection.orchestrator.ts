import mongoose from "mongoose";
import {
  DatabaseCopySummary,
  DatabaseImportSummary,
  PolyMongoActionsApi,
  PolyMongoAdvancedAccess,
  PolyMongoConnectResult,
  PolyMongoDisconnectResult,
  PolyMongoEventMap,
  PolyMongoEventName,
  PolyMongoOptions,
  PolyMongoPoolApi,
  PolyMongoScaleApi,
  PolyMongoStatsApi,
  PingResult,
  WrappedModel,
} from "../contracts/polymongo.contract";
import { DBSpecificConfig } from "../contracts/connection.contract";
import { LogManager, resolveLogOptions } from "../infrastructure/logger.adapter";
import { validateOptions } from "../internal/guards.internal";
import { HookManager } from "../lifecycle/client.lifecycle";
import { ConnectionManager } from "../lifecycle/connection.lifecycle";
import { WatchManager } from "../lifecycle/watch.lifecycle";
import { StatsService } from "../observability/metrics.collector";
import { getConnectionPoolSnapshot, waitForConnectionReady } from "./connection.utils";
import { DatabaseActionsService } from "./database-actions.service";
import { ModelWrapperService } from "./model-wrapper.service";
import { ScaleService } from "./scaling.orchestrator";
import { SharedConnectionService } from "./shared-connection.service";

export class PolyMongoWrapper {
  private mongoURI: string;
  private defaultDB: string;
  private maxPoolSize: number;
  private minFreeConnections: number;
  private idleTimeoutMS: number | undefined;
  private connectionManager: ConnectionManager;
  private hookManager: HookManager;
  private logManager: LogManager;
  private watchManager: WatchManager;
  private dbSpecificConfigs?: DBSpecificConfig[];
  private statsService: StatsService;
  private scaleService: ScaleService;
  private sharedConnections: SharedConnectionService;
  private modelWrapperService: ModelWrapperService;
  private databaseActions: DatabaseActionsService;

  public stats: PolyMongoStatsApi;
  public pool: PolyMongoPoolApi;
  public scale: PolyMongoScaleApi;
  public actions: PolyMongoActionsApi;
  public bulkTasks: {
    copyDatabase: (sourceDB: string, targetDB: string) => Promise<DatabaseCopySummary>;
    dropDatabase: (dbName: string) => Promise<void>;
    export: (dbName: string) => Promise<any>;
    import: (dbName: string, data: any) => Promise<DatabaseImportSummary>;
    exportStream: (dbName: string) => NodeJS.ReadableStream;
    importStream: (
      dbName: string,
      stream: NodeJS.ReadableStream,
      options?: { batchSize?: number; stopOnError?: boolean }
    ) => Promise<DatabaseImportSummary>;
  };
  public adv: PolyMongoAdvancedAccess;

  constructor(options: PolyMongoOptions) {
    try {
      validateOptions(options);

      this.hookManager = new HookManager();
      this.mongoURI = options.mongoURI;
      this.defaultDB = options.defaultDB ?? "default";
      this.maxPoolSize = options.maxPoolSize ?? 10;
      this.minFreeConnections = options.minFreeConnections ?? 0;
      this.idleTimeoutMS = options.idleTimeoutMS ?? undefined;
      this.dbSpecificConfigs = options.dbSpecific;
      this.logManager = new LogManager(resolveLogOptions(options));

      this.connectionManager = new ConnectionManager(
        this.mongoURI,
        this.defaultDB,
        this.maxPoolSize,
        this.minFreeConnections,
        this.idleTimeoutMS,
        options.retry,
        this.logManager,
        this.dbSpecificConfigs,
        this.hookManager
      );

      this.watchManager = new WatchManager(this.logManager);
      this.sharedConnections = new SharedConnectionService(
        this.connectionManager,
        this.hookManager,
        this.logManager
      );
      this.modelWrapperService = new ModelWrapperService(
        this.defaultDB,
        this.sharedConnections,
        this.watchManager,
        this.logManager
      );
      this.statsService = new StatsService(
        this.connectionManager,
        this.logManager,
        this.getPoolStats.bind(this),
        this.defaultDB
      );
      this.scaleService = new ScaleService(this.connectionManager, this.logManager);
      this.databaseActions = new DatabaseActionsService(
        this.defaultDB,
        this.connectionManager,
        this.sharedConnections,
        this.watchManager,
        this.logManager
      );

      this.stats = {
        general: this.statsService.general.bind(this.statsService),
        db: this.statsService.db.bind(this.statsService),
        listDatabases: this.statsService.listDatabases.bind(this.statsService),
      };

      this.pool = {
        connect: this.scaleService.connectDB.bind(this.scaleService),
        configure: this.scaleService.setDB.bind(this.scaleService),
      };

      this.scale = {
        connectDB: this.scaleService.connectDB.bind(this.scaleService),
        setDB: this.scaleService.setDB.bind(this.scaleService),
      };

      this.actions = this.databaseActions.createActionsApi(
        this.closeAllConnections.bind(this),
        this.forceCloseAllConnections.bind(this),
        this.closeDBstream.bind(this),
        this.closeAllWatches.bind(this)
      );

      this.bulkTasks = {
        copyDatabase: this.actions.copyDatabase,
        dropDatabase: this.actions.dropDatabase,
        export: this.actions.exportDB,
        import: this.actions.importDB,
        exportStream: this.actions.exportDBStream,
        importStream: this.actions.importDBStream,
      };

      this.adv = {
        mongoose,
        getPrimaryConnection: () => this.sharedConnections.getPrimaryConnection(),
        getOrCreatePrimaryConnection: () => this.sharedConnections.initPrimary(),
        getConnection: (dbName?: string) =>
          this.connectionManager.getConnection(dbName ?? this.defaultDB),
        getSharedConnection: (dbName?: string) =>
          this.sharedConnections.getSharedConnection(dbName ?? this.defaultDB),
      };

      this.logManager.log(
        `Creating PolyMongoWrapper with options: ${JSON.stringify(options)}`
      );

      if (options.coldStart === false) {
        this.logManager.log("Eager initializing primary connection");
        this.sharedConnections.initPrimary();
      } else {
        this.logManager.log("Cold start enabled - connection will initialize on first query");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to initialize PolyMongoWrapper: ${errorMsg}`);
    }
  }

  public on<K extends PolyMongoEventName>(
    eventName: K,
    callback: (event: PolyMongoEventMap[K]) => void | Promise<void>
  ): () => void {
    return this.hookManager.on(eventName, callback);
  }

  public async connect(): Promise<PolyMongoConnectResult> {
    const existingState = this.getConnectionState();
    const primary = this.sharedConnections.initPrimary();

    if (primary.readyState === 1) {
      return {
        success: true,
        alreadyConnected: true,
        defaultDB: this.defaultDB,
        connection: primary,
        state: "connected",
      };
    }

    await waitForConnectionReady(primary);

    return {
      success: true,
      alreadyConnected: existingState === "connected",
      defaultDB: this.defaultDB,
      connection: primary,
      state: "connected",
    };
  }

  public async disconnect(): Promise<PolyMongoDisconnectResult> {
    const alreadyDisconnected =
      !this.sharedConnections.getPrimaryConnection() && !this.connectionManager.primary;

    await this.closeAllConnections();

    return {
      success: true,
      alreadyDisconnected,
      state: "disconnected",
    };
  }

  public wrapModel<T>(baseModel: mongoose.Model<T>): WrappedModel<T> {
    return this.modelWrapperService.wrapModel(baseModel) as WrappedModel<T>;
  }

  public isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  public getConnectionState(): string {
    return this.connectionManager.getReadyState();
  }

  public ping(dbName?: string): Promise<PingResult> {
    return this.databaseActions.ping(dbName);
  }

  private getPoolStats(conn: mongoose.Connection | null): any {
    return getConnectionPoolSnapshot(conn, {
      maxPoolSize: this.maxPoolSize,
      minPoolSize: this.minFreeConnections,
      maxIdleTimeMS: this.idleTimeoutMS,
    });
  }

  private async closeAllConnections(): Promise<void> {
    try {
      this.logManager.log("Actions closeAll called");
      this.watchManager.closeAllWatches();
      this.sharedConnections.clearCache();
      await this.connectionManager.closeAll();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error in actions.closeAll: ${errorMsg}`);
      throw new Error(`Failed to close connections: ${errorMsg}`);
    }
  }

  private async forceCloseAllConnections(): Promise<void> {
    try {
      this.logManager.log("Actions forceCloseAll called");
      this.watchManager.closeAllWatches();
      this.sharedConnections.clearCache();
      await this.connectionManager.forceCloseAll();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error in actions.forceCloseAll: ${errorMsg}`);
      throw new Error(`Failed to force close connections: ${errorMsg}`);
    }
  }

  private closeDBstream(dbName: string): void {
    try {
      this.logManager.log(`Actions closeDBstream called for ${dbName}`);
      this.watchManager.closeDBstream(dbName);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error closing DB stream: ${errorMsg}`);
      throw new Error(`Failed to close database stream: ${errorMsg}`);
    }
  }

  private closeAllWatches(): void {
    try {
      this.logManager.log("Actions closeAllWatches called");
      this.watchManager.closeAllWatches();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error closing watches: ${errorMsg}`);
      throw new Error(`Failed to close watches: ${errorMsg}`);
    }
  }
}
