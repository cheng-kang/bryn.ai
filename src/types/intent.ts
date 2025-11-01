export interface Intent {
  id: string;
  label: string;
  labelConfidence: number;
  previousLabel?: string;
  labelUpdatedAt: number;
  confidence: number;
  status: IntentStatus;
  firstSeen: number;
  lastUpdated: number;
  reactivatedAt?: number;
  completedAt?: number;
  pageCount: number;
  pageIds: string[];
  aggregatedSignals: AggregatedSignals;
  progress?: IntentProgress;
  relatedIntents: string[];
  userFeedback: UserFeedback;
  timeline: TimelineEvent[];

  // Merge metadata (tracks intent lifecycle)
  metadata?: {
    mergedInto?: string; // Intent ID if merged
    mergedFrom?: string[]; // Intent IDs that merged into this
    mergedAt?: number; // When merge occurred
    completedReason?: "explicit" | "inferred" | "timeout" | "merged";
    archivedAt?: number; // When intent became terminal
  };

  // AI-generated content
  aiSummary?: string; // AI-generated prose summary of the intent
  goal?: string; // User's research goal (AI-inferred, user-editable)
  goalConfidence?: number; // Confidence in goal inference
  goalUpdatedAt?: number; // When goal was last updated
  insights?: IntentInsight[]; // Key insights with confidence levels
  nextSteps?: NextStep[]; // Suggested actions
}

export type IntentStatus =
  | "emerging" // <5 pages, confidence building
  | "active" // User actively browsing this topic
  | "dormant" // No activity for 30+ min, may resume
  | "completed" // User finished research (explicit or inferred)
  | "merged" // Merged into another intent
  | "discarded" // User explicitly dismissed
  | "expired"; // Auto-archived after 7 days dormant

export interface AggregatedSignals {
  keywords: Record<string, KeywordStats>;
  entities: {
    people: string[];
    places: string[];
    organizations: string[];
    products: string[];
    topics: string[];
  };
  domains: string[];
  patterns: {
    avgEngagement: number;
    avgDwellTime: number;
    avgScrollDepth: number;
    browsingStyle: "focused" | "exploratory" | "scanning";
  };
  cachedForPageCount: number;
}

export interface KeywordStats {
  count: number;
  avgEngagement: number;
  totalEngagement: number;
  recency: number;
}

export interface IntentProgress {
  milestones: Milestone[];
  completionEstimate: number;
}

export interface Milestone {
  step: string;
  status: "not_started" | "in_progress" | "completed";
  completedAt?: number;
  evidence: string[];
}

export interface UserFeedback {
  confirmed?: boolean;
  customLabel?: string;
  snoozeUntil?: number;
  discarded: boolean;
}

export interface TimelineEvent {
  date: string;
  event:
    | "created"
    | "page_added"
    | "label_changed"
    | "status_changed"
    | "merged"
    | "split"
    | string;
  details: string;
  // Optional metadata for specific event types
  pageId?: string;
  pageTitle?: string;
  from?: string;
  to?: string;
  sourceIntentId?: string;
  pagesMerged?: number;
  newPageCount?: number;
  confidence?: number;
  source?: "ai" | "user";
}

export interface IntentInsight {
  id: string;
  text: string;
  confidence: "high" | "medium" | "low";
  reasoning: string; // Why this insight is valid
  source: "ai" | "user";
  createdAt: number;
}

export interface NextStep {
  id: string;
  action: string;
  description: string;
  reasoning: string; // Why this step makes sense
  type: "visit" | "search" | "explore";
  url?: string;
  query?: string;
}
