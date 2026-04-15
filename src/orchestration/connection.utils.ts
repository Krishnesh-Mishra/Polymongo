import mongoose from "mongoose";

export async function waitForConnectionReady(
  conn: mongoose.Connection
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (conn.readyState === 1) {
      resolve();
      return;
    }

    const onOpen = () => {
      cleanup();
      resolve();
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      conn.off("open", onOpen);
      conn.off("error", onError);
    };

    conn.once("open", onOpen);
    conn.once("error", onError);
  });
}

export function getConnectionPoolSnapshot(
  conn: mongoose.Connection | null,
  fallback: {
    maxPoolSize: number;
    minPoolSize: number;
    maxIdleTimeMS?: number;
  }
): any {
  if (!conn) return null;
  const client = conn.getClient() as any;
  const pool = client?.s?.pool;
  if (!pool) return null;

  return {
    totalConnections:
      pool.totalConnectionCount ?? pool.totalCreatedConnectionCount ?? 0,
    availableConnections:
      pool.availableConnectionCount ?? pool.totalAvailableCount ?? 0,
    inUseConnections: pool.inUseConnectionCount ?? pool.totalInUseCount ?? 0,
    waitQueueSize:
      pool.waitQueueSize ?? pool.waitingClientsCount ?? pool.waitQueueMemberCount ?? 0,
    maxPoolSize: pool.maxPoolSize ?? fallback.maxPoolSize ?? 0,
    minPoolSize: pool.minPoolSize ?? fallback.minPoolSize ?? 0,
    maxIdleTimeMS: pool.maxIdleTimeMS ?? fallback.maxIdleTimeMS,
  };
}
