import mongoose from "mongoose";
import { createInterface } from "readline";
import { PassThrough, Readable } from "stream";
import {
  DatabaseCopySummary,
  DatabaseImportSummary,
  PingResult,
  PolyMongoActionsApi,
  PolyMongoStreamRecord,
} from "../contracts/polymongo.contract";
import { ConnectionManager } from "../lifecycle/connection.lifecycle";
import { WatchManager } from "../lifecycle/watch.lifecycle";
import { LogManager } from "../infrastructure/logger.adapter";
import { SharedConnectionService } from "./shared-connection.service";
import { waitForConnectionReady } from "./connection.utils";

type ImportOptions = { batchSize?: number; stopOnError?: boolean };

export class DatabaseActionsService {
  constructor(
    private defaultDB: string,
    private connectionManager: ConnectionManager,
    private sharedConnections: SharedConnectionService,
    private watchManager: WatchManager,
    private logManager: LogManager
  ) {}

  public createActionsApi(
    closeAll: () => Promise<void>,
    forceCloseAll: () => Promise<void>,
    closeDBstream: (dbName: string) => void,
    closeAllWatches: () => void
  ): PolyMongoActionsApi {
    return {
      copyDatabase: this.copyDatabase.bind(this),
      dropDatabase: this.dropDatabase.bind(this),
      exportDB: this.exportDatabase.bind(this),
      importDB: this.importDatabase.bind(this),
      exportDBStream: this.exportDatabaseStream.bind(this),
      importDBStream: this.importDatabaseStream.bind(this),
      closeAll,
      forceCloseAll,
      closeDBstream,
      closeAllWatches,
    };
  }

  public async ping(dbName?: string): Promise<PingResult> {
    const resolvedDb = dbName ?? this.defaultDB;
    const conn = this.connectionManager.getConnection(resolvedDb);
    await waitForConnectionReady(conn);

    if (!conn.db) {
      throw new Error("Database connection not ready");
    }

    const startedAt = Date.now();
    await conn.db.command({ ping: 1 });

    return {
      ok: true,
      dbName: resolvedDb,
      latency: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  public exportDatabaseStream(dbName: string): NodeJS.ReadableStream {
    return Readable.from(this.streamExportRecords(dbName), { encoding: "utf8" });
  }

  public async exportDatabase(dbName: string): Promise<any> {
    try {
      this.logManager.log(`Exporting database: ${dbName}`);
      const conn = this.connectionManager.getConnection(dbName);
      await waitForConnectionReady(conn);

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
        exportData.collections[collName] = {
          documents: await conn.db.collection(collName).find({}).toArray(),
          indexes: await conn.db.collection(collName).indexes(),
        };
      }

      return exportData;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error exporting database: ${errorMsg}`);
      throw new Error(`Failed to export database: ${errorMsg}`);
    }
  }

  public async importDatabase(
    dbName: string,
    data: any
  ): Promise<DatabaseImportSummary> {
    try {
      this.logManager.log(`Importing database payload to: ${dbName}`);

      if (!data.collections || typeof data.collections !== "object") {
        throw new Error("Invalid import data format");
      }

      const stream = new PassThrough();
      stream.write(
        `${JSON.stringify({
          type: "meta",
          format: "polymongo.ndjson",
          version: 1,
          database: data.database ?? dbName,
          exportedAt: data.exportDate ?? new Date().toISOString(),
        } satisfies PolyMongoStreamRecord)}\n`
      );

      for (const [collection, collData] of Object.entries(data.collections as Record<string, any>)) {
        stream.write(`${JSON.stringify({ type: "collection", collection } satisfies PolyMongoStreamRecord)}\n`);

        for (const index of Array.isArray(collData?.indexes) ? collData.indexes : []) {
          stream.write(`${JSON.stringify({ type: "index", collection, index } satisfies PolyMongoStreamRecord)}\n`);
        }

        for (const document of Array.isArray(collData?.documents) ? collData.documents : []) {
          stream.write(`${JSON.stringify({ type: "document", collection, document } satisfies PolyMongoStreamRecord)}\n`);
        }

        stream.write(`${JSON.stringify({ type: "collectionEnd", collection } satisfies PolyMongoStreamRecord)}\n`);
      }

      stream.end();
      return this.importDatabaseStream(dbName, stream);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error importing database: ${errorMsg}`);
      throw new Error(`Failed to import database: ${errorMsg}`);
    }
  }

  public async importDatabaseStream(
    dbName: string,
    stream: NodeJS.ReadableStream,
    options?: ImportOptions
  ): Promise<DatabaseImportSummary> {
    const batchSize = options?.batchSize ?? 1000;
    const stopOnError = options?.stopOnError ?? false;
    const conn = this.connectionManager.getConnection(dbName);
    await waitForConnectionReady(conn);

    if (!conn.db) {
      throw new Error("Database connection not ready");
    }

    const summary: DatabaseImportSummary = {
      database: dbName,
      importedAt: new Date().toISOString(),
      collections: [],
      failures: [],
      insertedDocuments: 0,
      createdIndexes: 0,
    };

    let activeCollection: string | null = null;
    let activeIndexes: Array<Record<string, any>> = [];
    let activeBatch: Array<Record<string, any>> = [];
    let insertedForCollection = 0;
    let failedCollection = false;

    const fail = (stage: "import" | "index", error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      summary.failures.push({
        collection: activeCollection!,
        stage,
        message,
      });
      this.logManager.log(`Collection ${activeCollection} failed during ${stage}: ${message}`);
      if (stopOnError) {
        throw new Error(message);
      }
      failedCollection = true;
    };

    const flushBatch = async () => {
      if (!activeCollection || !activeBatch.length || failedCollection) {
        activeBatch = [];
        return;
      }

      try {
        await conn.db!.collection(activeCollection).insertMany(activeBatch, { ordered: false });
        insertedForCollection += activeBatch.length;
        summary.insertedDocuments += activeBatch.length;
      } catch (error) {
        fail("import", error);
      } finally {
        activeBatch = [];
      }
    };

    const finishCollection = async () => {
      if (!activeCollection) return;
      await flushBatch();

      let createdIndexes = 0;
      if (!failedCollection) {
        try {
          createdIndexes = await this.createIndexes(conn, activeCollection, activeIndexes);
          summary.createdIndexes += createdIndexes;
        } catch (error) {
          fail("index", error);
        }
      }

      summary.collections.push({
        collection: activeCollection,
        documents: insertedForCollection,
        indexes: failedCollection ? 0 : createdIndexes,
      });

      activeCollection = null;
      activeIndexes = [];
      activeBatch = [];
      insertedForCollection = 0;
      failedCollection = false;
    };

    try {
      this.logManager.log(`Starting NDJSON import to: ${dbName}`);
      const lines = createInterface({ input: stream as any, crlfDelay: Infinity });

      for await (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const record = JSON.parse(line) as PolyMongoStreamRecord;

        if (record.type === "meta") {
          if (record.format !== "polymongo.ndjson" || record.version !== 1) {
            throw new Error("Unsupported stream format");
          }
          continue;
        }

        if (record.type === "collection") {
          await finishCollection();
          activeCollection = record.collection;
          continue;
        }

        if (!activeCollection || record.collection !== activeCollection) {
          throw new Error("Out-of-order stream record");
        }

        if (record.type === "index") {
          if (!failedCollection) activeIndexes.push(record.index);
          continue;
        }

        if (record.type === "document") {
          if (!failedCollection) {
            activeBatch.push(record.document);
            if (activeBatch.length >= batchSize) {
              await flushBatch();
            }
          }
          continue;
        }

        if (record.type === "collectionEnd") {
          await finishCollection();
        }
      }

      await finishCollection();
      this.logManager.log(`NDJSON import completed for: ${dbName}`);
      return summary;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error importing stream: ${errorMsg}`);
      throw new Error(`Failed to import stream: ${errorMsg}`);
    }
  }

  public async copyDatabase(
    sourceDB: string,
    targetDB: string
  ): Promise<DatabaseCopySummary> {
    try {
      this.logManager.log(`Copying database from ${sourceDB} to ${targetDB}`);
      const imported = await this.importDatabaseStream(
        targetDB,
        this.exportDatabaseStream(sourceDB)
      );

      return {
        source: sourceDB,
        target: targetDB,
        importedAt: imported.importedAt,
        collections: imported.collections,
        failures: imported.failures,
        insertedDocuments: imported.insertedDocuments,
        createdIndexes: imported.createdIndexes,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error copying database: ${errorMsg}`);
      throw new Error(`Failed to copy database: ${errorMsg}`);
    }
  }

  public async dropDatabase(dbName: string): Promise<void> {
    try {
      if (!dbName) {
        throw new Error("Database name is required to drop a database");
      }

      this.logManager.log(`Dropping database: ${dbName}`);
      const conn = this.connectionManager.getConnection(dbName);
      await waitForConnectionReady(conn);
      await conn.dropDatabase();
      this.sharedConnections.deleteSharedConnection(dbName);
      this.watchManager.closeDBstream(dbName);
      this.logManager.log(`Database ${dbName} dropped successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error dropping database ${dbName}: ${errorMsg}`);
      throw new Error(`Failed to drop database: ${errorMsg}`);
    }
  }

  private async *streamExportRecords(
    dbName: string
  ): AsyncGenerator<string, void, undefined> {
    this.logManager.log(`Starting NDJSON export for: ${dbName}`);
    const conn = this.connectionManager.getConnection(dbName);
    await waitForConnectionReady(conn);

    if (!conn.db) {
      throw new Error("Database connection not ready");
    }

    yield `${JSON.stringify({
      type: "meta",
      format: "polymongo.ndjson",
      version: 1,
      database: dbName,
      exportedAt: new Date().toISOString(),
    } satisfies PolyMongoStreamRecord)}\n`;

    for (const collInfo of await conn.db.listCollections().toArray()) {
      const collection = collInfo.name;
      yield `${JSON.stringify({ type: "collection", collection } satisfies PolyMongoStreamRecord)}\n`;

      for (const index of await conn.db.collection(collection).indexes()) {
        yield `${JSON.stringify({ type: "index", collection, index } satisfies PolyMongoStreamRecord)}\n`;
      }

      for await (const document of conn.db.collection(collection).find({})) {
        yield `${JSON.stringify({ type: "document", collection, document } satisfies PolyMongoStreamRecord)}\n`;
      }

      yield `${JSON.stringify({ type: "collectionEnd", collection } satisfies PolyMongoStreamRecord)}\n`;
    }

    this.logManager.log(`NDJSON export completed for: ${dbName}`);
  }

  private async createIndexes(
    conn: mongoose.Connection,
    collection: string,
    indexes: Array<Record<string, any>>
  ): Promise<number> {
    const filtered = indexes.filter((index) => index.name !== "_id_");
    if (!filtered.length) return 0;

    await Promise.all(
      filtered.map((index) => {
        const { key, v, ns, ...options } = index;
        return conn.db!.collection(collection).createIndex(key, options);
      })
    );

    return filtered.length;
  }
}
