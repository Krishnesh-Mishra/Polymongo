const mongoose = require('mongoose');

class PolyMongoWrapper {
  constructor({ mongoURI, poolSize = 10 }) {
    this.mongoURI = mongoURI;
    this.poolSize = poolSize;
    this.primary = null;
    this.connections = new Map();
  }

  _initPrimary() {
    if (!this.primary) {
      this.primary = mongoose.createConnection(this.mongoURI, {
        maxPoolSize: this.poolSize,
      });
    }
    return this.primary;
  }

  _getConnection(dbName = 'default') {
    if (this.connections.has(dbName)) {
      return this.connections.get(dbName);
    }
    const primary = this._initPrimary();
    const conn = primary.useDb(dbName, { useCache: true });
    this.connections.set(dbName, conn);
    return conn;
  }

  wrapModel(baseModel) {
    const wrapper = this;
    return {
      db(dbName = 'default') {
        const conn = wrapper._getConnection(dbName);
        return conn.model(baseModel.modelName, baseModel.schema);
      }
    };
  }
}

module.exports = { PolyMongoWrapper };