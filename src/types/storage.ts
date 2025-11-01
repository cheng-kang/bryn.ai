export interface StorageStats {
  totalPages: number;
  totalIntents: number;
  activeIntents: number;
  totalNudges: number;
  pendingNudges: number;
  usageBytes: number;
  usageMB: number;
  quotaBytes?: number;
  usagePercent?: number;
  lastActivity?: number; // Timestamp of most recent page visit
}

export interface IntentRelationship {
  id: string;
  fromIntentId: string;
  toIntentId: string;
  type: RelationType;
  confidence: number;
  reasoning: string;
  createdAt: number;
}

export type RelationType =
  | "continuation"
  | "consequence"
  | "parallel"
  | "evolution"
  | "unrelated";
