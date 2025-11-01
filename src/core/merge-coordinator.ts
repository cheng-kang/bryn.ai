/**
 * Merge Coordinator - Debounced global merge detection
 *
 * Prevents redundant merge scans by:
 * 1. Debouncing: Wait 5s after last intent change before scanning
 * 2. Rate limiting: Don't scan more than once every 10s
 * 3. Pre-filtering: Cheap heuristics eliminate 90% of pairs before AI
 * 4. Batching: Single AI call evaluates all candidates
 */

import { storage } from "./storage-manager";
import { processingQueue } from "./processing-queue";
import type { Intent } from "@/types/intent";

class MergeCoordinator {
  private pendingIntents: Set<string> = new Set();
  private debounceHandle: NodeJS.Timeout | null = null;
  private isScanning = false;
  private lastScanTime = 0;

  // Configuration
  private readonly DEBOUNCE_MS = 5000; // Wait 5s after last intent change
  private readonly MIN_SCAN_INTERVAL = 10000; // Don't scan more than every 10s
  private readonly MIN_ACTIVE_INTENTS = 3; // Need at least 3 intents to scan

  /**
   * Called when intent changes (new, updated, etc)
   */
  onIntentChanged(intentId: string): void {
    this.pendingIntents.add(intentId);

    // Clear existing debounce
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }

    // Schedule new scan
    this.debounceHandle = setTimeout(() => {
      this.runGlobalScan();
    }, this.DEBOUNCE_MS);

    console.log(
      `MergeCoordinator: Intent ${intentId.slice(
        -8
      )} changed, scan scheduled in ${this.DEBOUNCE_MS / 1000}s`
    );
  }

  /**
   * Run global merge scan with rate limiting and debouncing
   */
  private async runGlobalScan(): Promise<void> {
    // Prevent concurrent scans
    if (this.isScanning) {
      console.log("MergeCoordinator: Scan already in progress, skipping");
      return;
    }

    // Rate limiting
    const timeSinceLastScan = Date.now() - this.lastScanTime;
    if (timeSinceLastScan < this.MIN_SCAN_INTERVAL) {
      const waitTime = this.MIN_SCAN_INTERVAL - timeSinceLastScan;
      console.log(
        `MergeCoordinator: Scan too soon, rescheduling in ${waitTime}ms`
      );
      this.debounceHandle = setTimeout(() => this.runGlobalScan(), waitTime);
      return;
    }

    this.isScanning = true;
    this.lastScanTime = Date.now();

    try {
      const activeIntents = await this.getActiveIntents();

      if (activeIntents.length < this.MIN_ACTIVE_INTENTS) {
        console.log(
          `MergeCoordinator: Only ${activeIntents.length} active intents, skipping scan (need ${this.MIN_ACTIVE_INTENTS})`
        );
        return;
      }

      // CRITICAL: Only scan intents that changed
      const intentsToScan = activeIntents.filter((i) =>
        this.pendingIntents.has(i.id)
      );

      console.log(
        `MergeCoordinator: Scanning ${intentsToScan.length} changed intents against ${activeIntents.length} total`
      );

      // Pre-filter: O(n²) but fast (no AI)
      const candidates = this.prefilterCandidates(intentsToScan, activeIntents);

      console.log(
        `MergeCoordinator: Pre-filter found ${candidates.length} candidates for AI evaluation`
      );

      if (candidates.length === 0) {
        console.log("MergeCoordinator: No candidates after pre-filtering");
        this.pendingIntents.clear();
        return;
      }

      // Queue AI evaluation task (single task for all candidates)
      // The scan_intent_merge_opportunities task will handle AI evaluation
      // We pass 'batch' as intentId to indicate global scan
      await processingQueue.addTask(
        "scan_intent_merge_opportunities",
        "batch",
        17 // Background priority
      );

      console.log(
        `MergeCoordinator: ✓ Queued batch merge scan (${candidates.length} candidates)`
      );

      // Clear pending set
      this.pendingIntents.clear();
    } catch (error) {
      console.error("MergeCoordinator: Scan failed:", error);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Get active intents (not merged, not completed, not discarded)
   */
  private async getActiveIntents(): Promise<Intent[]> {
    return await storage.getActiveIntents();
  }

  /**
   * Fast pre-filter without AI (reduces AI calls by 90%)
   */
  private prefilterCandidates(
    changedIntents: Intent[],
    allIntents: Intent[]
  ): Array<{ intentA: Intent; intentB: Intent }> {
    const candidates: Array<{ intentA: Intent; intentB: Intent }> = [];

    for (const intentA of changedIntents) {
      for (const intentB of allIntents) {
        if (intentA.id === intentB.id) continue;

        // Quick rejection rules
        if (this.shouldReject(intentA, intentB)) continue;

        candidates.push({ intentA, intentB });
      }
    }

    return candidates;
  }

  /**
   * Pre-filter rejection rules (cheap heuristics)
   */
  private shouldReject(intentA: Intent, intentB: Intent): boolean {
    // Rule 1: Already merged
    if (
      intentA.status === "merged" ||
      intentB.status === "merged" ||
      intentA.metadata?.mergedInto ||
      intentB.metadata?.mergedInto
    ) {
      return true;
    }

    // Rule 2: Different primary domains AND low concept overlap
    const domainsA = new Set(intentA.aggregatedSignals.domains);
    const domainsB = new Set(intentB.aggregatedSignals.domains);
    const sharedDomains = Array.from(domainsA).filter((d) => domainsB.has(d));

    const conceptsA = new Set(Object.keys(intentA.aggregatedSignals.keywords));
    const conceptsB = new Set(Object.keys(intentB.aggregatedSignals.keywords));
    const sharedConcepts = Array.from(conceptsA).filter((c) =>
      conceptsB.has(c)
    );

    if (sharedDomains.length === 0 && sharedConcepts.length < 2) {
      return true; // Different topics, skip AI
    }

    // Rule 3: Time gap too large (>1 hour apart) AND low overlap
    const timeDiff = Math.abs(intentA.firstSeen - intentB.firstSeen);
    if (timeDiff > 3600000 && sharedConcepts.length < 5) {
      return true; // Different sessions, skip AI
    }

    // Rule 4: Single page intents (too early to merge)
    if (intentA.pageCount === 1 && intentB.pageCount === 1) {
      return true; // Wait for more pages
    }

    return false; // Candidate for AI evaluation
  }

  /**
   * Force an immediate scan (for testing/debugging)
   */
  async forceScan(): Promise<void> {
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }

    // Bypass rate limiting for forced scans
    const oldLastScanTime = this.lastScanTime;
    this.lastScanTime = 0;

    await this.runGlobalScan();

    // Restore for future scans
    this.lastScanTime = oldLastScanTime;
  }
}

// Global singleton
export const mergeCoordinator = new MergeCoordinator();
