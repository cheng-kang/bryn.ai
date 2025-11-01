export interface Nudge {
  id: string;
  intentId: string;
  type: NudgeType;
  priority: NudgePriority;
  status: NudgeStatus;
  message: NudgeMessage;
  suggestedActions: SuggestedAction[];
  timing: NudgeTiming;
  userResponse?: UserResponse;
}

export type NudgeType =
  | "reminder"
  | "memory_refresh"
  | "next_action"
  | "merge_suggestion"
  | "knowledge_gap"
  | "milestone_next"
  | "explore_related";
export type NudgePriority = "high" | "medium" | "low";
export type NudgeStatus =
  | "pending"
  | "shown"
  | "snoozed"
  | "acted"
  | "discarded";

export interface NudgeMessage {
  title: string;
  body: string;
  context: {
    reason: string;
    evidence: string[];
    confidence: number;
  };
}

export interface SuggestedAction {
  label: string;
  action:
    | "search"
    | "open_url"
    | "resume_session"
    | "merge_intents"
    | "explore_topic"
    | "compare_options"
    | "continue_reading";
  payload: any;
  confidence: number;
  reasoning: string;
}

export interface NudgeTiming {
  createdAt: number;
  triggerRule: string;
  snoozedUntil?: number;
  shownAt?: number;
  respondedAt?: number;
}

export interface UserResponse {
  action: "follow" | "snooze" | "custom" | "discard" | null;
  customAction?: string;
  feedback?: string;
  timestamp: number;
}
