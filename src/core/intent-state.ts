/**
 * Intent State Machine - Enforces valid state transitions
 */

import type { Intent, IntentStatus } from "@/types/intent";

// State transition rules
const STATE_TRANSITIONS: Record<IntentStatus, IntentStatus[]> = {
  emerging: ["active", "merged", "discarded", "dormant"],
  active: ["dormant", "completed", "merged", "discarded"],
  dormant: ["active", "completed", "expired", "merged", "discarded"],

  // Terminal states (cannot transition)
  completed: [],
  merged: [],
  discarded: [],
  expired: [],
};

/**
 * Check if a status transition is valid
 */
export function canTransition(from: IntentStatus, to: IntentStatus): boolean {
  const allowedTransitions = STATE_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

/**
 * Transition intent to new status with validation and timeline event
 */
export function transitionStatus(
  intent: Intent,
  newStatus: IntentStatus,
  reason?: string,
  metadata?: any
): void {
  if (!canTransition(intent.status, newStatus)) {
    throw new Error(
      `Invalid status transition: ${intent.status} → ${newStatus}`
    );
  }

  const oldStatus = intent.status;
  intent.status = newStatus;

  // Set completedAt for terminal states
  if (isTerminal(newStatus) && !intent.completedAt) {
    intent.completedAt = Date.now();
  }

  // Set metadata for terminal states
  if (isTerminal(newStatus)) {
    if (!intent.metadata) {
      intent.metadata = {};
    }
    intent.metadata.archivedAt = Date.now();

    if (reason) {
      intent.metadata.completedReason = reason as any;
    }
  }

  // Add timeline event
  intent.timeline.push({
    date: new Date().toISOString().split("T")[0],
    event: "status_changed",
    details: reason || `Status changed from ${oldStatus} to ${newStatus}`,
    from: oldStatus,
    to: newStatus,
    ...metadata,
  });
}

/**
 * Check if intent is in active state (visible in UI)
 */
export function isActive(intent: Intent): boolean {
  return ["emerging", "active", "dormant"].includes(intent.status);
}

/**
 * Check if intent is terminal (never changes again)
 */
export function isTerminal(status: IntentStatus): boolean {
  return STATE_TRANSITIONS[status].length === 0;
}

/**
 * Check if intent is archived (not shown in main UI)
 */
export function isArchived(intent: Intent): boolean {
  return isTerminal(intent.status);
}

/**
 * Get merge chain (follow merges to find final intent)
 */
export async function getMergeChain(
  intentId: string,
  getIntent: (id: string) => Promise<Intent | null>
): Promise<Intent[]> {
  const chain: Intent[] = [];
  let currentId: string | undefined = intentId;

  while (currentId) {
    const intent = await getIntent(currentId);
    if (!intent) break;

    chain.push(intent);

    // Follow merge trail
    currentId = intent.metadata?.mergedInto;

    // Prevent infinite loops
    if (chain.length > 20) {
      console.warn(
        `getMergeChain: Detected circular merge chain for ${intentId}`
      );
      break;
    }
  }

  return chain;
}

/**
 * Get final intent after following merge chain
 */
export async function getFinalIntent(
  intentId: string,
  getIntent: (id: string) => Promise<Intent | null>
): Promise<Intent | null> {
  const chain = await getMergeChain(intentId, getIntent);
  return chain[chain.length - 1] || null;
}

/**
 * Check if intent should auto-transition to dormant
 * (no activity for 30 minutes)
 */
export function shouldTransitionToDormant(intent: Intent): boolean {
  if (intent.status !== "active" && intent.status !== "emerging") {
    return false;
  }

  const inactiveMs = Date.now() - intent.lastUpdated;
  const DORMANT_THRESHOLD = 30 * 60 * 1000; // 30 minutes

  return inactiveMs > DORMANT_THRESHOLD;
}

/**
 * Check if dormant intent should auto-transition to expired
 * (dormant for 7 days)
 */
export function shouldTransitionToExpired(intent: Intent): boolean {
  if (intent.status !== "dormant") {
    return false;
  }

  const dormantMs = Date.now() - intent.lastUpdated;
  const EXPIRED_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days

  return dormantMs > EXPIRED_THRESHOLD;
}

/**
 * Auto-transition intent based on activity patterns
 * Called periodically by background service
 */
export function autoTransitionIntent(intent: Intent): boolean {
  let transitioned = false;

  if (shouldTransitionToDormant(intent)) {
    transitionStatus(
      intent,
      "dormant",
      "Auto-transitioned: No activity for 30 minutes"
    );
    transitioned = true;
  } else if (shouldTransitionToExpired(intent)) {
    transitionStatus(
      intent,
      "expired",
      "Auto-transitioned: Dormant for 7 days"
    );
    transitioned = true;
  }

  return transitioned;
}


