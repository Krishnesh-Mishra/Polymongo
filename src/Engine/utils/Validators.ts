import { PolyMongoOptions } from "../../types";

export function validateOptions(options: PolyMongoOptions): void {
  if (!options.mongoURI) {
    throw new Error("mongoURI is required");
  }

  if (typeof options.mongoURI !== "string") {
    throw new Error("mongoURI must be a string");
  }

  if (
    !options.mongoURI.startsWith("mongodb://") &&
    !options.mongoURI.startsWith("mongodb+srv://")
  ) {
    throw new Error("mongoURI must start with mongodb:// or mongodb+srv://");
  }

  if (
    options.maxPoolSize !== undefined &&
    (typeof options.maxPoolSize !== "number" || options.maxPoolSize < 1)
  ) {
    throw new Error("maxPoolSize must be a positive number");
  }

  if (
    options.minFreeConnections !== undefined &&
    (typeof options.minFreeConnections !== "number" ||
      options.minFreeConnections < 0)
  ) {
    throw new Error("minFreeConnections must be a non-negative number");
  }

  if (
    options.idleTimeoutMS !== undefined &&
    (typeof options.idleTimeoutMS !== "number" || options.idleTimeoutMS < 0)
  ) {
    throw new Error("idleTimeoutMS must be a non-negative number");
  }

  if (
    options.minFreeConnections !== undefined &&
    options.maxPoolSize !== undefined &&
    options.minFreeConnections > options.maxPoolSize
  ) {
    throw new Error("minFreeConnections cannot be greater than maxPoolSize");
  }
}