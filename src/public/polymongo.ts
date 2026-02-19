// src/public/polymongo.ts
import { PolyMongoWrapper } from "../orchestration/connection.orchestrator";
import { PolyMongoOptions } from "../contracts/polymongo.contract";

/**
 * Main entry point for the PolyMongo library.
 * Use `PolyMongo.createWrapper()` to initialize the connection manager.
 */
export class PolyMongo extends PolyMongoWrapper {
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
