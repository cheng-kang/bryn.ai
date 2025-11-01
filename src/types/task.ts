// Task dependency and error classification types

export const ERROR_TYPES = {
  TRANSIENT: "transient" as const, // Retry with backoff
  PERMANENT: "permanent" as const, // Don't retry
  DEPENDENCY: "dependency" as const, // Retry if dependency succeeds
};

export type ErrorType = (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES];

export interface ErrorClassification {
  [pattern: string]: ErrorType;
}

export const ERROR_CLASSIFICATION: ErrorClassification = {
  // Transient errors
  "API rate limit": ERROR_TYPES.TRANSIENT,
  "Network timeout": ERROR_TYPES.TRANSIENT,
  "Service unavailable": ERROR_TYPES.TRANSIENT,
  "Invalid JSON response": ERROR_TYPES.TRANSIENT,

  // Dependency errors
  "Page has no intent assignment": ERROR_TYPES.DEPENDENCY,
  "Page has no semantic features": ERROR_TYPES.DEPENDENCY,
  "Semantic features not ready": ERROR_TYPES.DEPENDENCY,

  // Permanent errors
  "Intent not found": ERROR_TYPES.PERMANENT,
  "Page not found": ERROR_TYPES.PERMANENT,
  "Merge validation failed": ERROR_TYPES.PERMANENT,
};

export interface TaskAttempt {
  attemptNumber: number;
  timestamp: number;
  error?: string;
  errorType?: ErrorType;
  durationMs?: number;
}

export interface TaskDependency {
  taskId: string;
  required: boolean; // If true, task blocks; if false, task is optional
}


