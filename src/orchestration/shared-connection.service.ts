import mongoose from "mongoose";
import { ConnectionManager } from "../lifecycle/connection.lifecycle";
import { HookManager } from "../lifecycle/client.lifecycle";
import { LogManager } from "../infrastructure/logger.adapter";

export class SharedConnectionService {
  private primaryConn?: mongoose.Connection;
  private dbCache = new Map<string, mongoose.Connection>();
  private hookBoundConnections = new WeakSet<mongoose.Connection>();
  private emittedConnectForShared = new WeakSet<mongoose.Connection>();

  constructor(
    private connectionManager: ConnectionManager,
    private hookManager: HookManager,
    private logManager: LogManager
  ) {}

  public getPrimaryConnection(): mongoose.Connection | undefined {
    return this.primaryConn ?? this.connectionManager.primary ?? undefined;
  }

  public initPrimary(): mongoose.Connection {
    if (this.primaryConn) {
      return this.primaryConn;
    }

    this.primaryConn = this.connectionManager.initPrimary();
    this.logManager.log("Primary connection initialized for shared use");
    return this.primaryConn;
  }

  public getSharedConnection(dbName: string): mongoose.Connection {
    const primary = this.initPrimary();

    if (this.dbCache.has(dbName)) {
      this.logManager.log(`Using cached shared connection for database: ${dbName}`);
      return this.dbCache.get(dbName)!;
    }

    this.logManager.log(`Creating shared connection for database: ${dbName}`);
    const dbConn = primary.useDb(dbName, { useCache: true });
    this.attachSharedConnectionHooks(primary, dbConn);
    this.dbCache.set(dbName, dbConn);
    return dbConn;
  }

  public clearCache(): void {
    this.dbCache.clear();
    this.primaryConn = undefined;
  }

  public deleteSharedConnection(dbName: string): void {
    this.dbCache.delete(dbName);
  }

  private attachSharedConnectionHooks(
    primary: mongoose.Connection,
    connection: mongoose.Connection
  ): void {
    if (this.hookBoundConnections.has(connection)) {
      return;
    }

    this.hookBoundConnections.add(connection);

    const emitConnect = () => {
      if (this.emittedConnectForShared.has(connection)) {
        return;
      }

      this.emittedConnectForShared.add(connection);
      this.hookManager.emit(
        this.hookManager.createConnectEvent("connect", connection)
      );
    };

    connection.on("connected", emitConnect);

    connection.on("disconnected", () => {
      this.emittedConnectForShared.delete(connection);
      this.hookManager.emit(
        this.hookManager.createDisconnectEvent("disconnect", connection)
      );
    });

    connection.on("error", (error) => {
      const resolvedError =
        error instanceof Error ? error : new Error(String(error));
      this.hookManager.emit(
        this.hookManager.createErrorEvent(connection, resolvedError)
      );
    });

    if (primary.readyState === 1 || connection.readyState === 1) {
      queueMicrotask(emitConnect);
    } else {
      primary.once("connected", emitConnect);
    }
  }
}
