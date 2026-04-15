import * as winston from "winston";
import * as path from "path";
import * as fs from "fs";
import {
  PolyMongoDebugOptions,
  PolyMongoOptions,
} from "../contracts/polymongo.contract";

/**
 * Normalized logging configuration used internally by the wrapper.
 */
export interface ResolvedLogOptions {
  /** Whether PolyMongo should emit debug logs at all. */
  enabled: boolean;
  /** Optional folder path for file-based logging. */
  logPath?: string;
  /** Optional user callback for consuming formatted log lines. */
  logHandler?: PolyMongoDebugOptions["logHandler"];
}

/**
 * Converts public wrapper options into a stable internal logging config.
 * @param options - Wrapper options supplied by the user
 * @returns Normalized logging configuration
 */
export function resolveLogOptions(
  options: Pick<PolyMongoOptions, "debug" | "logPath">
): ResolvedLogOptions {
  if (typeof options.debug === "boolean") {
    return {
      enabled: options.debug,
      logPath: options.logPath,
    };
  }

  const debugOptions = options.debug;

  return {
    enabled: debugOptions?.log ?? false,
    logPath: debugOptions?.logPath ?? options.logPath,
    logHandler: debugOptions?.logHandler,
  };
}

export class LogManager {
  private readonly options: ResolvedLogOptions;
  private readonly logger?: winston.Logger;

  constructor(options: ResolvedLogOptions) {
    this.options = options;

    if (options.logPath) {
      const finalPath = path.resolve(options.logPath);

      if (!fs.existsSync(finalPath)) {
        fs.mkdirSync(finalPath, { recursive: true });
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const logFileName = `polymongo-${timestamp}.log`;

      this.logger = winston.createLogger({
        level: options.enabled ? "debug" : "info",
        format: winston.format.combine(
          winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          winston.format.errors({ stack: true }),
          winston.format.printf(({ timestamp, level, message, stack }) => {
            return `[${timestamp}] [${level.toUpperCase()}] ${message}${stack ? `\n${stack}` : ""}`;
          })
        ),
        transports: [
          new winston.transports.File({
            filename: path.join(finalPath, logFileName),
            maxsize: 5242880,
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: path.join(finalPath, "error.log"),
            level: "error",
            maxsize: 5242880,
            maxFiles: 5,
          }),
        ],
      });
    }
  }

  /**
   * Emits a debug log line to configured destinations.
   * @param message - Value to serialize into a log message
   */
  log(message: unknown): void {
    if (!this.options.enabled) {
      return;
    }

    const formatted = this.formatLine("info", `[PolyMongo Debug] ${this.stringifyMessage(message)}`);
    this.logger?.info(`[PolyMongo Debug] ${this.stringifyMessage(message)}`);
    this.forwardToHandler(formatted);
  }

  /**
   * Emits an error log line to configured destinations.
   * @param message - Error message to record
   * @param error - Optional source error
   */
  err(message: string, error?: Error): void {
    const fullMessage = error?.stack ? `${message}\n${error.stack}` : message;
    const formatted = this.formatLine("error", fullMessage);

    this.logger?.error(message, { stack: error?.stack });
    this.forwardToHandler(formatted);
  }

  private stringifyMessage(message: unknown): string {
    if (typeof message === "string") {
      return message;
    }

    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }

  private formatLine(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  private forwardToHandler(message: string): void {
    if (!this.options.logHandler) {
      return;
    }

    Promise.resolve(this.options.logHandler(message)).catch(() => {
      // User logging callbacks should never break PolyMongo internals.
    });
  }
}
