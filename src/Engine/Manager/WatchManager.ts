// src/Engine/Manager/WatchManager.ts
import { LogManager } from "./LogManager";
import type { ChangeStream } from "mongodb";

export class WatchManager {
  private watchConnections: Set<string> = new Set();
  private activeStreams: Map<string, Set<ChangeStream>> = new Map();
  constructor(private logManager: LogManager) {}

  markWatch(dbName: string): void {
    this.watchConnections.add(dbName);
    this.logManager.log(
      `Watch stream started for database: ${dbName} (total watches: ${this.watchConnections.size})`,
    );
  }

  unmarkWatch(dbName: string): void {
    this.watchConnections.delete(dbName);
    this.logManager.log(
      `Watch stream closed for database: ${dbName} (total watches: ${this.watchConnections.size})`,
    );
  }
  addStream(dbName: string, stream: ChangeStream): void {
    if (!this.activeStreams.has(dbName)) {
      this.activeStreams.set(dbName, new Set());
    }
    this.activeStreams.get(dbName)!.add(stream);
    if (this.activeStreams.get(dbName)!.size === 1) {
      this.markWatch(dbName);
    }
    this.logManager.log(
      `Added stream for database: ${dbName} (streams: ${this.activeStreams.get(dbName)!.size})`,
    );
  }

  removeStream(dbName: string, stream: ChangeStream): void {
    const streams = this.activeStreams.get(dbName);
    if (streams) {
      streams.delete(stream);
      this.logManager.log(
        `Removed stream for database: ${dbName} (remaining: ${streams.size})`,
      );
      if (streams.size === 0) {
        this.activeStreams.delete(dbName);
        this.unmarkWatch(dbName);
      }
    }
  }

  closeDBstream(dbName: string): void {
    const streams = this.activeStreams.get(dbName);
    if (streams) {
      this.logManager.log(
        `Closing ${streams.size} streams for database: ${dbName}`,
      );
      for (const stream of streams) {
        stream.close();
      }
      streams.clear();
      this.activeStreams.delete(dbName);
      this.unmarkWatch(dbName);
    } else {
      this.logManager.log(`No streams to close for database: ${dbName}`);
    }
  }

  closeAllWatches(): void {
    this.logManager.log(
      `Closing all watches across ${this.activeStreams.size} databases`,
    );
    for (const dbName of this.activeStreams.keys()) {
      this.closeDBstream(dbName);
    }
  }
}
