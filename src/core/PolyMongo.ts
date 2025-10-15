import { PolyMongoWrapper } from "../Engine/Wrapper";
import { PolyMongoOptions } from "../types";

export class PolyMongo extends PolyMongoWrapper {
  static createWrapper(options: PolyMongoOptions): PolyMongo {
    return new PolyMongo(options);
  }

  constructor(options: PolyMongoOptions) {
    super(options);
  }
}