import mongoose from "mongoose";
import { WrappedModel } from "../contracts/polymongo.contract";
import { LogManager } from "../infrastructure/logger.adapter";
import { WatchManager } from "../lifecycle/watch.lifecycle";
import { SharedConnectionService } from "./shared-connection.service";

export class ModelWrapperService {
  constructor(
    private defaultDB: string,
    private sharedConnections: SharedConnectionService,
    private watchManager: WatchManager,
    private logManager: LogManager
  ) {}

  public wrapModel<T>(baseModel: mongoose.Model<T>): WrappedModel<T> {
    if (!baseModel || !baseModel.modelName || !baseModel.schema) {
      throw new Error("Invalid model provided to wrapModel");
    }

    const getModelForDB = (dbName: string): mongoose.Model<T> => {
      try {
        this.logManager.log(
          `Accessing model ${baseModel.modelName} for database: ${dbName}`
        );

        const conn = this.sharedConnections.getSharedConnection(dbName);
        const model = conn.model<T>(baseModel.modelName, baseModel.schema);

        const originalWatch = model.watch.bind(model);
        model.watch = ((...args: any[]) => {
          try {
            const stream = originalWatch(...args);
            this.watchManager.addStream(dbName, stream);

            stream.on("close", () => {
              this.watchManager.removeStream(dbName, stream);
            });

            stream.on("error", (error) => {
              this.logManager.log(
                `Watch stream error for ${dbName}: ${error.message}`
              );
              this.watchManager.removeStream(dbName, stream);
            });

            return stream;
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : "Unknown error";
            this.logManager.log(`Failed to create watch stream: ${errorMsg}`);
            throw new Error(`Failed to create watch stream: ${errorMsg}`);
          }
        }) as any;

        return model;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        this.logManager.log(
          `Error accessing model ${baseModel.modelName} for ${dbName}: ${errorMsg}`
        );
        throw new Error(`Failed to access model: ${errorMsg}`);
      }
    };

    const wrappedModel = new Proxy(
      {
        db: (dbName?: string): mongoose.Model<T> =>
          getModelForDB(dbName ?? this.defaultDB),
      } as any,
      {
        get: (target, prop) => {
          if (prop === "db") {
            return target.db;
          }

          const defaultModel = getModelForDB(this.defaultDB);
          const value = (defaultModel as any)[prop];
          return typeof value === "function" ? value.bind(defaultModel) : value;
        },
      }
    );

    return wrappedModel as WrappedModel<T>;
  }
}
