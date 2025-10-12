// src/utils/scoring.ts
import { ConnectionStats } from '../types';

export function calculateScore(stats: ConnectionStats): number {
  const { useCount, avgInterval, idleTime, priority } = stats;
  if (priority === -1) return Infinity;
  const priorityWeight = -priority;
  const intervalTerm = avgInterval > 0 ? (useCount * 10) / avgInterval : 0;
  const idleTerm = idleTime * 0.001;
  return intervalTerm - idleTerm + priorityWeight;
}