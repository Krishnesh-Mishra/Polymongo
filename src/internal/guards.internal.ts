// src/internal/guards.internal.ts
import { PolyMongoOptions } from "../contracts/polymongo.contract";

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
    options.retry !== undefined &&
    (typeof options.retry !== "number" || options.retry < 0)
  ) {
    throw new Error("retry must be a non-negative number");
  }

  if (
    options.minFreeConnections !== undefined &&
    options.maxPoolSize !== undefined &&
    options.minFreeConnections > options.maxPoolSize
  ) {
    throw new Error("minFreeConnections cannot be greater than maxPoolSize");
  }

  if (options.debug !== undefined && typeof options.debug !== "boolean") {
    if (typeof options.debug !== "object" || options.debug === null) {
      throw new Error("debug must be a boolean or an object");
    }

    if (
      options.debug.log !== undefined &&
      typeof options.debug.log !== "boolean"
    ) {
      throw new Error("debug.log must be a boolean");
    }

    if (
      options.debug.logPath !== undefined &&
      typeof options.debug.logPath !== "string"
    ) {
      throw new Error("debug.logPath must be a string");
    }

    if (
      options.debug.logHandler !== undefined &&
      typeof options.debug.logHandler !== "function"
    ) {
      throw new Error("debug.logHandler must be a function");
    }
  }

  if (options.logPath !== undefined && typeof options.logPath !== "string") {
    throw new Error("logPath must be a string");
  }
}
