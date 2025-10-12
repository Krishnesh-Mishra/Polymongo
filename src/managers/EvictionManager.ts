// src/managers/EvictionManager.ts
import { calculateScore } from '../utils/scoring';
import { ConnectionManager } from './ConnectionManager';

export class EvictionManager {
  private idleChecker: NodeJS.Timeout | null = null;

  constructor(private connectionManager: ConnectionManager, private idleTimeout: number) {
    this.startIdleChecker();
  }

  async evictIfPossible(): Promise<boolean> {
    const stats = this.connectionManager.getStats();
    const candidates = stats
      .filter(s => s.priority !== -1 && !s.hasWatch)
      .sort((a, b) => calculateScore(a) - calculateScore(b));
    if (candidates.length === 0) return false;
    const toEvict = candidates[0].dbName;
    await this.connectionManager.closeConnection(toEvict);
    return true;
  }

  private startIdleChecker() {
    this.idleChecker = setInterval(async () => {
      const stats = this.connectionManager.getStats();
      for (const stat of stats) {
        if (stat.idleTime > this.idleTimeout && stat.priority !== -1 && !stat.hasWatch) {
          await this.connectionManager.closeConnection(stat.dbName);
        }
      }
    }, this.idleTimeout / 10);
  }

  destroy() {
    if (this.idleChecker) clearInterval(this.idleChecker);
  }
}