// src/public/polymongo.ts
import { PolyMongoWrapper } from "../orchestration/connection.orchestrator";
import { PolyMongoOptions } from "../contracts/polymongo.contract";

export class PolyMongo extends PolyMongoWrapper {
  static createWrapper(options: PolyMongoOptions): PolyMongo {
    return new PolyMongo(options);
  }

  constructor(options: PolyMongoOptions) {
    super(options);
  }
}
