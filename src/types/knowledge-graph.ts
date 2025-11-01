export interface UserKnowledgeGraph {
  interests: Record<string, InterestProfile>;
  knowledge: Record<string, KnowledgeLevel>;
  entities: EntityGraph;
  lastUpdated: number;
  version: number;
}

export interface InterestProfile {
  topic: string;
  firstSeen: number;
  lastSeen: number;
  frequency: number; // Visit count
  totalDwellTime: number;
  avgEngagement: number;
  depth: "shallow" | "moderate" | "deep";
  relatedTopics: string[];
  intentIds: string[]; // Intents related to this interest
}

export interface KnowledgeLevel {
  topic: string;
  level: "beginner" | "learning" | "proficient" | "expert";
  evidence: string[]; // Page IDs that support this level
  confidence: number;
  lastAssessed: number;
}

export interface EntityGraph {
  people: Record<string, EntityProfile>;
  organizations: Record<string, EntityProfile>;
  products: Record<string, EntityProfile>;
  creators: Record<string, EntityProfile>;
}

export interface EntityProfile {
  name: string;
  type: "person" | "organization" | "product" | "creator";
  firstSeen: number;
  lastSeen: number;
  frequency: number;
  contexts: string[]; // Topics where this entity appears
  relatedIntents: string[];
}
