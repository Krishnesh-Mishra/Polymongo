// src/infrastructure/logger.adapter.ts
import * as winston from "winston";
import * as path from "path";
import * as fs from "fs";

export class LogManager {
  private debug: boolean;
  private logger: winston.Logger;

  constructor(debug: boolean, logPath?: string) {
    this.debug = debug;
    const finalPath = logPath || path.join(process.cwd(), "logs", "Polymongo");

    // Ensure directory exists
    if (!fs.existsSync(finalPath)) {
      fs.mkdirSync(finalPath, { recursive: true });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    const logFileName = `polymongo-${timestamp}.log`;

    this.logger = winston.createLogger({
      level: debug ? "debug" : "info",
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `[${timestamp}] [${level.toUpperCase()}] ${message}${stack ? `\n${stack}` : ""}`;
        }),
      ),
      transports: [
        new winston.transports.File({
          filename: path.join(finalPath, logFileName),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: path.join(finalPath, "error.log"),
          level: "error",
          maxsize: 5242880,
          maxFiles: 5,
        }),
        ...(debug ? [new winston.transports.Console()] : []),
      ],
    });
  }

  log(message: any): void {
    if (this.debug) {
      const formatted =
        typeof message === "string" ? message : JSON.stringify(message);
      this.logger.info(`[PolyMongo Debug] ${formatted}`);
    }
  }

  err(message: string, error?: Error): void {
    this.logger.error(message, { stack: error?.stack });
  }
}
