// src/lifecycle/client.lifecycle.ts
import mongoose from "mongoose";
import {
  PolyMongoBaseEvent,
  PolyMongoConnectEvent,
  PolyMongoDisconnectEvent,
  PolyMongoErrorEvent,
  PolyMongoEventMap,
  PolyMongoEventName,
} from "../contracts/polymongo.contract";

export class HookManager {
  public hooks: {
    listeners: {
      [K in PolyMongoEventName]: Array<(event: PolyMongoEventMap[K]) => void | Promise<void>>;
    };
  };

  constructor() {
    this.hooks = {
      listeners: {
        connect: [],
        disconnect: [],
        error: [],
        onDbConnect: [],
        onDbDisconnect: [],
      },
    };
  }

  /**
   * Registers a lifecycle event listener.
   * @param eventName - Name of the lifecycle event to observe
   * @param callback - Function invoked each time the event is emitted
   * @returns A cleanup function that removes the registered listener
   */
  public on<K extends PolyMongoEventName>(
    eventName: K,
    callback: (event: PolyMongoEventMap[K]) => void | Promise<void>
  ): () => void {
    this.hooks.listeners[eventName].push(callback);

    return () => {
      const listeners = this.hooks.listeners[eventName];
      const index = listeners.indexOf(callback);

      if (index >= 0) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Emits a lifecycle event to all listeners for the event and its aliases.
   * @param event - Event payload to dispatch
   */
  public emit(event: PolyMongoBaseEvent): void {
    const eventNames = this.getEventNames(event);

    for (const eventName of eventNames) {
      const listeners = this.hooks.listeners[eventName] ?? [];
      for (const listener of listeners) {
        void listener(event as never);
      }
    }
  }

  /**
   * Converts mongoose connection state numbers into readable labels.
   * @param readyState - Mongoose ready state number
   * @returns Human readable state label
   */
  public getReadyStateLabel(
    readyState: number
  ): PolyMongoBaseEvent["state"] {
    const states: Record<number, PolyMongoBaseEvent["state"]> = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    return states[readyState] ?? "unknown";
  }

  /**
   * Creates a standard connect payload from a mongoose connection.
   * @param name - Emitted event name
   * @param connection - Mongoose connection that triggered the event
   * @returns Structured event payload
   */
  public createConnectEvent(
    name: PolyMongoConnectEvent["name"],
    connection: mongoose.Connection
  ): PolyMongoConnectEvent {
    return {
      name,
      dbName: connection.name,
      readyState: connection.readyState,
      state: this.getReadyStateLabel(connection.readyState),
      connection,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Creates a standard disconnect payload from a mongoose connection.
   * @param name - Emitted event name
   * @param connection - Mongoose connection that triggered the event
   * @returns Structured event payload
   */
  public createDisconnectEvent(
    name: PolyMongoDisconnectEvent["name"],
    connection: mongoose.Connection
  ): PolyMongoDisconnectEvent {
    return {
      name,
      dbName: connection.name,
      readyState: connection.readyState,
      state: this.getReadyStateLabel(connection.readyState),
      connection,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Creates a standard error payload from a mongoose connection.
   * @param connection - Mongoose connection that triggered the error
   * @param error - Error emitted by mongoose
   * @returns Structured event payload
   */
  public createErrorEvent(
    connection: mongoose.Connection,
    error: Error
  ): PolyMongoErrorEvent {
    return {
      name: "error",
      dbName: connection.name,
      readyState: connection.readyState,
      state: this.getReadyStateLabel(connection.readyState),
      connection,
      timestamp: new Date().toISOString(),
      error,
    };
  }

  private getEventNames(event: PolyMongoBaseEvent): PolyMongoEventName[] {
    if (event.name === "connect" || event.name === "onDbConnect") {
      return ["connect", "onDbConnect"];
    }

    if (event.name === "disconnect" || event.name === "onDbDisconnect") {
      return ["disconnect", "onDbDisconnect"];
    }

    return ["error"];
  }
}
