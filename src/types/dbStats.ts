import { PoolStats } from ".";

export interface CollectionStats {
  name: string;
  docCount: number;
  sizeMb: number;
}

export interface DbStats {
  sizeMb: number;
  numCollections: number;
  collections: CollectionStats[];
  lastUsed: Date;
  mongoURI: string;
  isInitialized: boolean;
  config: any;
  poolStats: PoolStats | null;
}