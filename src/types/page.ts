export interface PageData {
  id: string;
  url: string;
  title: string;
  timestamp: number;
  content: string | null;
  contentSummary: string | null;
  contentSize: number;
  metadata: PageMetadata;
  semanticFeatures?: SemanticFeatures;
  embedding?: number[];
  interactions: PageInteractions;
  intentAssignments: IntentAssignments;
  processedAt?: number;
  behavioralClass?: BehavioralClassification;
}

export interface PageMetadata {
  domain: string;
  lang: string;
  detectedLanguage?: string;
  languageConfidence?: number;
  referrer?: string;

  // Rich metadata for AI inference (observations, not decisions)
  canonical?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;

  // Page characteristics (facts AI can use to make decisions)
  titleContains404: boolean;
  titleContainsError: boolean;
  bodyTextLength: number;
  hasNavigation: boolean;
  headingCount: number;
  linkCount: number;
}

export interface SemanticFeatures {
  concepts: string[];
  entities: {
    people: string[];
    places: string[];
    organizations: string[];
    products: string[];
    topics: string[];
  };
  intentSignals: {
    primaryAction: string;
    confidence: number;
    evidence: string[];
    goal: string;
  };
  contentType: string;
  sentiment: string;
}

export interface PageInteractions {
  dwellTime: number;
  scrollDepth: number;
  scrollPosition: number;
  totalScrollDistance: number;
  textSelections: TextSelection[];
  engagementScore: number;
  focusedSections?: FocusedSection[];
}

export interface FocusedSection {
  heading: string;
  timeSpent: number;
  scrollStart: number;
  scrollEnd: number;
  textSelections: number;
}

export interface TextSelection {
  text: string;
  length: number;
  timestamp: number;
  nearestHeading?: string;
  scrollPercentage: number;
}

export interface IntentAssignments {
  primary: IntentAssignment | null;
  secondary: IntentAssignment[];
}

export interface IntentAssignment {
  intentId: string;
  confidence: number;
  role: "primary" | "secondary";
  assignedAt: number;
  autoAssigned: boolean;
  needsConfirmation?: boolean;
  mergedFrom?: string; // Tracks if assignment came from a merge
}

export type UserBehavior =
  | "deep_reading"
  | "skimming"
  | "watching_video"
  | "form_filling"
  | "comparing_items"
  | "searching"
  | "navigating";

export interface BehavioralClassification {
  primaryBehavior: UserBehavior;
  confidence: number;
  evidence: string[];
  classifiedAt: number;
}
