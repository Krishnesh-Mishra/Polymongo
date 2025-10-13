// src/models/WrapperModel.ts
import { Schema, Document, Model, Query, Aggregate } from 'mongoose';
import { ChangeStream } from 'mongodb';
import PolyMongo from '../core/PolyMongo';
import { WrappedModel } from '../interfaces';

export default function createWrappedModel<T extends Document>(wrapper: PolyMongo, schema: Schema, modelName: string, dbName?: string): WrappedModel<T> {
  const effectiveDb = dbName || wrapper.config.defaultDB!;
  return new Proxy(Model.prototype, {
    get(_target: any, prop: string | symbol) {
      if (prop === 'db') {
        return (newDbName: string) => createWrappedModel(wrapper, schema, modelName, newDbName);
      }
      return (...args: any[]) => {
        const conn = wrapper.connectionManager.getConnection(effectiveDb);
        const model = conn.model(modelName, schema);
        const value = model[prop as keyof typeof model];
        if (typeof value !== 'function') return value;
        if (prop === 'watch') {
          wrapper.connectionManager.useConnection(effectiveDb);
          const stream = value.apply(model, args) as ChangeStream;
          wrapper.connectionManager.markWatch(effectiveDb, true);
          stream.on('close', () => wrapper.connectionManager.markWatch(effectiveDb, false));
          return stream;
        }
        const result = value.apply(model, args);
        if (result instanceof Query || result instanceof Aggregate) {
          return new Proxy(result, {
            get(target, p: string | symbol) {
              const val = Reflect.get(target, p);
              if (typeof val === 'function') {
                return (...a: any[]) => {
                  const r = val.apply(target, a);
                  if (p === 'exec' || p === 'then') {
                    wrapper.connectionManager.useConnection(effectiveDb);
                  }
                  if (r === target) {
                    return new Proxy(target, this);
                  }
                  return r;
                };
              }
              return val;
            }
          });
        } else {
          wrapper.connectionManager.useConnection(effectiveDb);
          return result;
        }
      };
    }
  }) as WrappedModel<T>;
}