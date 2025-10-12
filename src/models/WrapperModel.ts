// src/models/WrapperModel.ts
import { Schema, Document, Model } from 'mongoose';
import { ChangeStream } from 'mongodb';
import PolyMongo from '../core/PolyMongo';
import { WrappedModel } from '../interfaces';

export default function createWrappedModel<T extends Document>(wrapper: PolyMongo, schema: Schema, modelName: string, dbName?: string): WrappedModel<T> {
  const effectiveDb = dbName || wrapper.config.defaultDB!;
  const target = function () {} as any;
  const handler: ProxyHandler<typeof target> = {
    construct: async (_target, args) => {
      const conn = await wrapper.connectionManager.getConnection(effectiveDb);
      const model = conn.model(modelName, schema);
      await wrapper.connectionManager.useConnection(effectiveDb);
      return Reflect.construct(model, args);
    },
    get: (_target, prop: string | symbol) => {
      if (prop === 'db') {
        return (newDbName: string) => createWrappedModel(wrapper, schema, modelName, newDbName);
      }
      return async (...args: any[]) => {
        const conn = await wrapper.connectionManager.getConnection(effectiveDb);
        const model = conn.model(modelName, schema);
        await wrapper.connectionManager.useConnection(effectiveDb);
        const value = (model as any)[prop];
        if (typeof value !== 'function') {
          return value;
        }
        if (prop === 'watch') {
          const stream = value.apply(model, args) as ChangeStream;
          wrapper.connectionManager.markWatch(effectiveDb, true);
          stream.on('close', () => wrapper.connectionManager.markWatch(effectiveDb, false));
          return stream;
        }
        return value.apply(model, args);
      };
    },
    getPrototypeOf: () => Model.prototype,
  };
  return new Proxy(target, handler) as WrappedModel<T>;
}