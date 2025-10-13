// src/utils/scoring.ts
import { ConnectionStats } from '../types';

/**
 * Advanced connection scoring using multi-factor weighted algorithm
 * Higher score = keep connection, Lower score = evict first
 */
export function calculateScore(stats: ConnectionStats): number {
  const { useCount, avgInterval, idleTime, priority, lastUsed } = stats;
  
  // Never evict protected connections
  if (priority === -1) return Infinity;
  
  const now = Date.now();
  
  // 1. Frequency Score: Exponential decay based on access frequency
  // More frequent access = higher score
  const accessFrequency = avgInterval > 0 ? 1000 / avgInterval : 0; // accesses per second
  const frequencyScore = Math.log1p(accessFrequency * 100) * 50;
  
  // 2. Usage Volume Score: Logarithmic scale for total operations
  // Rewards well-used connections without over-favoring extremely high counts
  const volumeScore = Math.log1p(useCount) * 20;
  
  // 3. Recency Score: Exponential decay based on time since last use
  // Recent use heavily weighted, exponentially decays over time
  const recencyDecay = Math.exp(-idleTime / 300000); // Half-life of 5 minutes
  const recencyScore = recencyDecay * 100;
  
  // 4. Idle Penalty: Exponential penalty for extended idle time
  // Steep penalty after idle threshold
  const idleThreshold = 60000; // 1 minute
  const idlePenalty = idleTime > idleThreshold 
    ? Math.pow((idleTime - idleThreshold) / 60000, 1.5) * -10
    : 0;
  
  // 5. Predictive Next Access: Estimate likelihood of near-term access
  // Uses average interval to predict if connection will be needed soon
  const timeSinceLastUse = now - lastUsed;
  const predictedNextAccess = avgInterval > 0 ? avgInterval * 1.2 : Infinity;
  const likelihoodScore = timeSinceLastUse < predictedNextAccess
    ? (1 - timeSinceLastUse / predictedNextAccess) * 30
    : 0;
  
  // 6. Priority Multiplier: Non-linear scaling
  // Priority differences matter more at extremes
  const priorityMultiplier = Math.pow(priority / 100, 1.5);
  
  // 7. Stability Score: Reward consistent usage patterns
  // Connections with predictable patterns get bonus
  const stabilityBonus = useCount > 10 && avgInterval > 0
    ? Math.min(20, (useCount / Math.sqrt(avgInterval)) * 0.5)
    : 0;
  
  // Weighted combination
  const baseScore = (
    frequencyScore * 0.25 +
    volumeScore * 0.15 +
    recencyScore * 0.30 +
    likelihoodScore * 0.20 +
    stabilityBonus * 0.10
  );
  
  // Apply multipliers and penalties
  const finalScore = (baseScore * priorityMultiplier) + idlePenalty;
  
  return Math.max(0, finalScore); // Floor at 0
}

/**
 * Alternative: Machine learning-inspired scoring with adaptive weights
 */
export function calculateAdaptiveScore(stats: ConnectionStats): number {
  const { useCount, avgInterval, idleTime, priority } = stats;
  
  if (priority === -1) return Infinity;
  
  // Normalize features to [0, 1] range
  const normalizedFreq = Math.tanh(avgInterval > 0 ? 1000 / avgInterval : 0);
  const normalizedVolume = Math.tanh(useCount / 100);
  const normalizedRecency = Math.exp(-idleTime / 180000); // 3 min half-life
  const normalizedPriority = priority / 200;
  
  // Sigmoid activation for non-linear relationships
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
  
  // Weighted sum with learned coefficients (tune these based on your workload)
  const weights = {
    frequency: 0.35,
    volume: 0.20,
    recency: 0.30,
    priority: 0.15
  };
  
  const linearCombination = 
    normalizedFreq * weights.frequency +
    normalizedVolume * weights.volume +
    normalizedRecency * weights.recency +
    normalizedPriority * weights.priority;
  
  // Apply activation and scale to [0, 100]
  return sigmoid(linearCombination * 10) * 100;
}

/**
 * Get eviction recommendation with confidence score
 */
export function getEvictionRecommendation(
  allStats: ConnectionStats[]
): { dbName: string; score: number; confidence: number } | null {
  
  const candidates = allStats.filter(s => s.priority !== -1 && !s.hasWatch);
  
  if (candidates.length === 0) return null;
  
  const scored = candidates.map(stat => ({
    dbName: stat.dbName,
    score: calculateScore(stat),
    stat
  })).sort((a, b) => a.score - b.score);
  
  const lowest = scored[0];
  const highest = scored[scored.length - 1];
  
  // Confidence based on score distribution
  const scoreRange = highest.score - lowest.score;
  const confidence = scoreRange > 0 
    ? Math.min(1, (highest.score - lowest.score) / highest.score)
    : 0.5;
  
  return {
    dbName: lowest.dbName,
    score: lowest.score,
    confidence
  };
}