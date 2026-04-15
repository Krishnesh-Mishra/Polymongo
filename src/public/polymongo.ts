// src/public/polymongo.ts
import { PolyMongoWrapper } from "../orchestration/connection.orchestrator";
import {
  PolyMongoAdvancedAccess,
  PolyMongoActionsApi,
  PolyMongoConnectResult,
  PolyMongoDebugOptions,
  PolyMongoDisconnectResult,
  PolyMongoErrorEvent,
  PolyMongoConnectEvent,
  PolyMongoDisconnectEvent,
  PolyMongoEventMap,
  PolyMongoEventName,
  PolyMongoOptions,
  PolyMongoPoolApi,
  PolyMongoScaleApi,
  PolyMongoStatsApi,
  PolyMongoStreamRecord,
} from "../contracts/polymongo.contract";
import {
  ConnectionStats as PolyMongoConnectionStats,
  DBSpecificConfig,
} from "../contracts/connection.contract";

/**
 * Main entry point for the PolyMongo library.
 * Use `PolyMongo.createWrapper()` to initialize the connection manager.
 */
export class PolyMongo extends PolyMongoWrapper {
  /**
   * Type-discovery namespace placeholder.
   * This exists so editors show `PolyMongo.Types.*` in autocomplete for quick discovery.
   * Use the nested names in type positions only.
   */
  static readonly Types = Object.freeze({});

  /**
   * Creates an instance of PolyMongo with the specified options.
   * @param options - Configuration for connection pooling and multi-database management
   * @returns A new PolyMongo wrapper instance
   */
  static createWrapper(options: PolyMongoOptions): PolyMongo {
    return new PolyMongo(options);
  }

  constructor(options: PolyMongoOptions) {
    super(options);
  }
}

/**
 * Namespace-style type exports for IDE discovery via `PolyMongo.Types.*`.
 */
export namespace PolyMongo {
  /**
   * Namespace containing the primary public PolyMongo types.
   */
  export namespace Types {
    export type wrapperOptions = PolyMongoOptions;
    export type debugOptions = PolyMongoDebugOptions;
    export type eventName = PolyMongoEventName;
    export type eventMap = PolyMongoEventMap;
    export type connectEvent = PolyMongoConnectEvent;
    export type disconnectEvent = PolyMongoDisconnectEvent;
    export type errorEvent = PolyMongoErrorEvent;
    export type connectResult = PolyMongoConnectResult;
    export type disconnectResult = PolyMongoDisconnectResult;
    export type advancedAccess = PolyMongoAdvancedAccess;
    export type actionsApi = PolyMongoActionsApi;
    export type poolApi = PolyMongoPoolApi;
    export type scaleApi = PolyMongoScaleApi;
    export type statsApi = PolyMongoStatsApi;
    export type pingResult = import("../contracts/polymongo.contract").PingResult;
    export type streamRecord = PolyMongoStreamRecord;
    export type databaseActionSummary = import("../contracts/polymongo.contract").DatabaseActionSummary;
    export type databaseExportSummary = import("../contracts/polymongo.contract").DatabaseExportSummary;
    export type databaseImportSummary = import("../contracts/polymongo.contract").DatabaseImportSummary;
    export type databaseCopySummary = import("../contracts/polymongo.contract").DatabaseCopySummary;
    export type wrappedModel<T> = import("../contracts/polymongo.contract").WrappedModel<T>;
    export type dbConfig = DBSpecificConfig;
    export type stats = PolyMongoConnectionStats;

    export type Options = PolyMongoOptions;
    export type DebugOptions = PolyMongoDebugOptions;
    export type EventName = PolyMongoEventName;
    export type EventMap = PolyMongoEventMap;
    export type ConnectEvent = PolyMongoConnectEvent;
    export type DisconnectEvent = PolyMongoDisconnectEvent;
    export type ErrorEvent = PolyMongoErrorEvent;
    export type ConnectResult = PolyMongoConnectResult;
    export type DisconnectResult = PolyMongoDisconnectResult;
    export type AdvancedAccess = PolyMongoAdvancedAccess;
    export type ActionsApi = PolyMongoActionsApi;
    export type PoolApi = PolyMongoPoolApi;
    export type ScaleApi = PolyMongoScaleApi;
    export type StatsApi = PolyMongoStatsApi;
    export type PingResult = import("../contracts/polymongo.contract").PingResult;
    export type StreamRecord = PolyMongoStreamRecord;
    export type DatabaseActionSummary = import("../contracts/polymongo.contract").DatabaseActionSummary;
    export type DatabaseExportSummary = import("../contracts/polymongo.contract").DatabaseExportSummary;
    export type DatabaseImportSummary = import("../contracts/polymongo.contract").DatabaseImportSummary;
    export type DatabaseCopySummary = import("../contracts/polymongo.contract").DatabaseCopySummary;
    export type WrappedModel<T> = import("../contracts/polymongo.contract").WrappedModel<T>;
    export type DBConfig = DBSpecificConfig;
    export type ConnectionStats = PolyMongoConnectionStats;
  }
}
