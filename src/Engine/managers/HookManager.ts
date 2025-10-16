import * as mongoose from "mongoose";

export class HookManager {
  public hooks: {
    onDbConnect: Array<(db: mongoose.Connection) => void>;
    onDbDisconnect: Array<(db: mongoose.Connection) => void>;
    onTheseDBConnect: Map<string, Array<(db: mongoose.Connection) => void>>;
    onTheseDBDisconnect: Map<string, Array<(db: mongoose.Connection) => void>>;
  };

  constructor() {
    this.hooks = {
      onDbConnect: [],
      onDbDisconnect: [],
      onTheseDBConnect: new Map(),
      onTheseDBDisconnect: new Map(),
    };
  }

  public onDbConnect(callback: (db: mongoose.Connection) => void): void {
    this.hooks.onDbConnect.push(callback);
  }

  public onDbDisconnect(callback: (db: mongoose.Connection) => void): void {
    this.hooks.onDbDisconnect.push(callback);
  }

  public onTheseDBConnect(dbNames: string[], callback: (db: mongoose.Connection) => void): void {
    dbNames.forEach(dbName => {
      if (!this.hooks.onTheseDBConnect.has(dbName)) {
        this.hooks.onTheseDBConnect.set(dbName, []);
      }
      this.hooks.onTheseDBConnect.get(dbName)!.push(callback);
    });
  }

  public onTheseDBDisconnect(dbNames: string[], callback: (db: mongoose.Connection) => void): void {
    dbNames.forEach(dbName => {
      if (!this.hooks.onTheseDBDisconnect.has(dbName)) {
        this.hooks.onTheseDBDisconnect.set(dbName, []);
      }
      this.hooks.onTheseDBDisconnect.get(dbName)!.push(callback);
    });
  }
}