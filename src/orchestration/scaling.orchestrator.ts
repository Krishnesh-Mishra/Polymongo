// src/orchestration/scaling.orchestrator.ts
import { ConnectionManager } from "../lifecycle/connection.lifecycle";
import { LogManager } from "../infrastructure/logger.adapter";
import { ScaleOptions } from "../contracts/connection.contract";

export class ScaleService {
  constructor(
    private connectionManager: ConnectionManager,
    private logManager: LogManager
  ) {}

  async connectDB(dbNames: string[], options?: ScaleOptions): Promise<void> {
    try {
      this.logManager.log(`Scale.connectDB called for: ${dbNames.join(', ')}`);
      await this.connectionManager.connectDB(dbNames, options);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error in scale.connectDB: ${errorMsg}`);
      throw new Error(`Failed to scale connections: ${errorMsg}`);
    }
  }

  setDB(dbNames: string[], options?: ScaleOptions & { mongoURI?: string }): void {
    try {
      this.logManager.log(`Scale.setDB called for: ${dbNames.join(', ')}`);
      this.connectionManager.setDB(dbNames, options);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logManager.log(`Error in scale.setDB: ${errorMsg}`);
      throw new Error(`Failed to set DB configuration: ${errorMsg}`);
    }
  }
}
