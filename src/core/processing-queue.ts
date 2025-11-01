// Async AI processing queue - processes pages in background
import { aiPipeline } from "./ai-pipeline";
import { storage } from "./storage-manager";
import { knowledgeGraph } from "./knowledge-graph";
import type { PageData } from "@/types/page";
import type { Intent, KeywordStats } from "@/types/intent";
import {
  ERROR_CLASSIFICATION,
  ERROR_TYPES,
  type ErrorType,
  type TaskAttempt,
} from "@/types/task";

const FALLBACK_ACTION_VERBS: Record<string, string> = {
  learning: "Learning",
  explore: "Exploring",
  exploring: "Exploring",
  research: "Researching",
  researching: "Researching",
  finding: "Finding",
  search: "Searching",
  searching: "Searching",
  comparing: "Comparing",
  shopping: "Shopping",
  planning: "Planning",
  investigating: "Investigating",
  studying: "Studying",
  analyzing: "Analyzing",
  reviewing: "Reviewing",
};

const DEDUPE_ELIGIBLE_TASKS = new Set<string>([
  "generate_activity_summary",
  "generate_intent_label",
  "generate_intent_goal",
  "generate_intent_summary",
  "generate_intent_insights",
  "generate_intent_next_steps",
  "ai_verify_intent_matching",
  "ai_analyze_knowledge_gaps",
  "ai_predict_milestone",
  "scan_intent_merge_opportunities",
]);

function toTitleCase(word: string): string {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function normalizeKeyword(keyword: string): string | null {
  if (!keyword) return null;
  const cleaned = keyword
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => toTitleCase(w.toLowerCase()))
    .join(" ")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

function pickFallbackActionVerb(intent: Intent, pages: PageData[]): string {
  const actionCandidates: string[] = [];

  for (const page of pages) {
    const action = page.semanticFeatures?.intentSignals?.primaryAction;
    if (action) {
      actionCandidates.push(action.toLowerCase());
    }
  }

  if (intent?.aggregatedSignals?.patterns?.browsingStyle === "focused") {
    actionCandidates.push("studying");
  }

  for (const candidate of actionCandidates) {
    if (FALLBACK_ACTION_VERBS[candidate]) {
      return FALLBACK_ACTION_VERBS[candidate];
    }
  }

  return "Researching";
}

function collectKeywordCandidates(intent: Intent, pages: PageData[]): string[] {
  const keywordScores = new Map<string, number>();

  const addKeyword = (keyword: string, weight = 1) => {
    const normalized = normalizeKeyword(keyword);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    keywordScores.set(key, (keywordScores.get(key) || 0) + weight);
  };

  for (const page of pages) {
    const weight = Math.max(page.interactions?.engagementScore || 0.5, 0.1);
    for (const concept of page.semanticFeatures?.concepts || []) {
      addKeyword(concept, weight);
    }

    const entities = page.semanticFeatures?.entities;
    if (entities) {
      for (const group of Object.values(entities)) {
        if (!Array.isArray(group)) continue;
        for (const entity of group) {
          addKeyword(entity, weight * 0.75);
        }
      }
    }
  }

  if (intent?.aggregatedSignals?.keywords) {
    for (const [keyword, details] of Object.entries(
      intent.aggregatedSignals.keywords
    )) {
      let score = 1;
      if (typeof details === "number") {
        score = details;
      } else if (details) {
        const stats = details as KeywordStats;
        score =
          Number(stats.totalEngagement) ||
          Number(stats.count) ||
          Number(stats.avgEngagement) ||
          1;
      }
      addKeyword(keyword, score);
    }
  }

  return [...keywordScores.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([keyword]) => normalizeKeyword(keyword) || "")
    .filter((keyword) => keyword.length > 0);
}

function buildHeuristicFallbackLabel(
  intent: Intent,
  pages: PageData[]
): { label: string; confidence: number; reasoning: string } {
  const actionVerb = pickFallbackActionVerb(intent, pages);
  const keywordCandidates = collectKeywordCandidates(intent, pages);

  const words: string[] = [actionVerb];

  const usedWords = new Set<string>([actionVerb.toLowerCase()]);

  for (const candidate of keywordCandidates) {
    const candidateWords = candidate.split(" ");
    let added = false;
    for (const word of candidateWords) {
      const lower = word.toLowerCase();
      if (!usedWords.has(lower)) {
        words.push(word);
        usedWords.add(lower);
        added = true;
      }
      if (words.length >= 5) break;
    }
    if (added && words.length >= 5) break;
    if (words.length >= 5) break;
  }

  while (words.length < 3) {
    const filler = words.length === 1 ? "Insights" : "Focus";
    if (!usedWords.has(filler.toLowerCase())) {
      words.push(filler);
      usedWords.add(filler.toLowerCase());
    } else {
      words.push("Exploration");
      break;
    }
  }

  const label = words.slice(0, 6).join(" ");

  const reasoningKeywords = keywordCandidates.slice(0, 3).join(", ");

  return {
    label,
    confidence: 0.45,
    reasoning:
      reasoningKeywords.length > 0
        ? `Fallback label generated from intent keywords: ${reasoningKeywords}`
        : "Fallback label generated from browsing intent heuristics",
  };
}

async function buildFallbackIntentLabel(
  intent: Intent,
  pages: PageData[]
): Promise<{
  label: string;
  confidence: number;
  reasoning: string;
  source: "ai" | "heuristic";
}> {
  try {
    try {
      await aiPipeline.initialize();
    } catch (error) {
      console.warn(
        "ProcessingQueue: AI pipeline not ready for fallback label",
        error
      );
    }

    if (aiPipeline.isAvailable()) {
      const session = await aiPipeline.getSession({
        initialPrompts: [
          {
            role: "system",
            content:
              "You are an assistant that names browsing intents. Produce concise, user-friendly labels (3-6 words, action verb first) that capture the specific topic. Avoid copying page titles or generic phrases like 'New Insights'. Always return valid JSON.",
          },
        ],
        temperature: 0.4,
        topK: 2,
      });

      const topKeywords = collectKeywordCandidates(intent, pages).slice(0, 8);
      const topDomains = intent.aggregatedSignals.domains.slice(0, 4);
      const samplePages = pages
        .slice(0, 3)
        .map((p) => p.title.replace(/["']/g, ""));

      const prompt = `Create a replacement intent label.

CURRENT LABEL: ${intent.label}
INTENT STATUS: ${intent.status}
TOP KEYWORDS: ${topKeywords.join(", ") || "(none)"}
TOP DOMAINS: ${topDomains.join(", ") || "(none)"}
SAMPLE PAGES: ${samplePages.join(" | ") || "(unknown)"}

RULES:
1. Start with an action verb (Learning, Exploring, Researching, Comparing, Planning, Shopping, Investigating, Studying, Analyzing, Discovering).
2. Mention a concrete subject (technology, location, product, topic).
3. 3-6 words total. No punctuation beyond spaces.
4. Do NOT reuse the existing label if it is vague. Avoid terms like "New Insights" or "Browsing Pattern".
5. Prefer nouns from keywords/domains over generic words.

Return ONLY valid JSON:
{
  "label": "Exploring Fremont Tennis Courts",
  "confidence": 0.72,
  "reasoning": "Action verb + location/topic summarize the research"
}`;

      const response = await session.prompt(prompt);
      const cleaned = response
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

      if (parsed?.label && typeof parsed.label === "string") {
        return {
          label: parsed.label.trim(),
          confidence: Math.min(
            Math.max(Number(parsed.confidence) || 0.55, 0.3),
            0.95
          ),
          reasoning:
            typeof parsed.reasoning === "string"
              ? parsed.reasoning
              : "AI-generated fallback label based on keywords and domains",
          source: "ai",
        };
      }
    }
  } catch (error) {
    console.warn("ProcessingQueue: AI fallback label generation failed", error);
  }

  const heuristic = buildHeuristicFallbackLabel(intent, pages);
  return { ...heuristic, source: "heuristic" };
}

export interface QueuedTask {
  id: string;
  type:
    | "semantic_extraction"
    | "intent_matching"
    | "summarization"
    | "classify_behavior"
    | "generate_intent_label"
    | "generate_intent_goal"
    | "generate_intent_summary"
    | "generate_intent_insights"
    | "generate_intent_next_steps"
    | "ai_verify_intent_matching"
    | "scan_intent_merge_opportunities"
    | "merge_intents"
    | "ai_analyze_knowledge_gaps"
    | "ai_predict_milestone"
    | "generate_activity_summary";
  pageId?: string; // Optional for intent-level tasks
  intentId?: string; // For intent-level tasks
  mergeData?: { sourceIntentId: string; targetIntentId: string }; // For merge tasks
  pageTitle?: string;
  pageUrl?: string;
  priority: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  status: "queued" | "processing" | "completed" | "failed";
  retryCount: number;
  error?: string;
  friendlyName?: string;

  // Task dependencies (explicit blocking)
  dependencies?: string[]; // Task IDs that must complete first
  dependents?: Set<string>; // Task IDs that depend on this (runtime only)

  // Retry tracking
  attempts?: TaskAttempt[];
  errorType?: ErrorType;

  // AI execution details for debugging (legacy)
  aiDetails?: {
    prompt?: string;
    response?: string;
    model: string;
    inputLength?: number;
    outputLength?: number;
  };

  // Input/output data (legacy)
  input?: any;
  output?: any;

  // New structured execution details
  aiExecution?: {
    api: "LanguageModel" | "Summarizer" | "LanguageDetector" | "none";
    prompt?: string;
    response?: string;
    parameters?: {
      temperature?: number;
      topK?: number;
      model: string;
    };
  };

  // Structured input/output
  structuredInput?: any;
  structuredOutput?: any;
}

interface TaskAverage {
  total: number;
  count: number;
  avg: number;
}

class ProcessingQueue {
  private queue: QueuedTask[] = [];
  private isProcessing = false;
  private listeners: Set<() => void> = new Set();
  private initialized = false;

  // Task dependency tracking
  private taskMap: Map<string, QueuedTask> = new Map(); // Quick lookup by ID
  private completedTasks: Set<string> = new Set(); // Track completed task IDs
  private recentTaskHistory: Map<
    string,
    { completedAt: number; structuredOutput?: any; friendlyName: string }
  > = new Map();

  // Resource management
  private maxConcurrentAI = 2; // Max concurrent AI sessions (global)
  private activeAITasks = 0;
  private lastAITaskTime = 0; // For temporal smoothing

  // Priority-based concurrency limits
  private readonly PRIORITY_LIMITS = {
    critical: { priorities: [1, 2, 3], maxConcurrent: 1 }, // Page tasks - serialize
    important: { priorities: [5, 6, 15, 17], maxConcurrent: 2 }, // Label, goal, verify, scan
    background: { priorities: [20, 21, 22, 25, 30], maxConcurrent: 1 }, // Features, merges
  };

  private activePriorityTasks = {
    critical: 0,
    important: 0,
    background: 0,
  };

  // Historical averages for ETA prediction
  private taskAverages: Record<QueuedTask["type"], TaskAverage> = {
    semantic_extraction: { total: 0, count: 0, avg: 12000 }, // Default 12s
    summarization: { total: 0, count: 0, avg: 4000 }, // Default 4s
    classify_behavior: { total: 0, count: 0, avg: 5000 }, // Default 5s
    intent_matching: { total: 0, count: 0, avg: 500 }, // Default 0.5s
    generate_intent_label: { total: 0, count: 0, avg: 6000 }, // Default 6s
    generate_intent_goal: { total: 0, count: 0, avg: 5000 }, // Default 5s
    generate_intent_summary: { total: 0, count: 0, avg: 8000 }, // Default 8s
    generate_intent_insights: { total: 0, count: 0, avg: 10000 }, // Default 10s
    generate_intent_next_steps: { total: 0, count: 0, avg: 8000 }, // Default 8s
    ai_verify_intent_matching: { total: 0, count: 0, avg: 12000 }, // Default 12s
    scan_intent_merge_opportunities: { total: 0, count: 0, avg: 15000 }, // Default 15s
    merge_intents: { total: 0, count: 0, avg: 2000 }, // Default 2s
    ai_analyze_knowledge_gaps: { total: 0, count: 0, avg: 15000 }, // Default 15s
    ai_predict_milestone: { total: 0, count: 0, avg: 15000 }, // Default 15s
    generate_activity_summary: { total: 0, count: 0, avg: 10000 }, // Default 10s
  };

  /**
   * Initialize queue from IndexedDB (restore after restart)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load user settings
      const settings = await storage.getSettings();
      this.applySettings(settings);
      console.log(
        `ProcessingQueue: Loaded settings - AI Intensity: ${settings.aiIntensity}`
      );

      // Restore queued tasks
      const savedTasks = await storage.getAllQueueTasks();

      // Restore queued and processing tasks (skip completed/failed)
      const activeTasks = savedTasks.filter(
        (t: QueuedTask) => t.status === "queued" || t.status === "processing"
      );

      if (activeTasks.length > 0) {
        // Reset processing tasks to queued (they were interrupted)
        activeTasks.forEach((t: QueuedTask) => {
          if (t.status === "processing") {
            t.status = "queued";
            t.startedAt = undefined;
          }

          // Rebuild task map
          this.taskMap.set(t.id, t);

          // Track completed tasks
          if (t.status === "completed") {
            this.completedTasks.add(t.id);
          }
        });

        this.queue = activeTasks;

        // Rebuild dependency graph
        this.buildDependencyGraph();

        console.log(
          `ProcessingQueue: Restored ${activeTasks.length} queued tasks from storage`
        );

        // Start processing
        this.processNext();
      } else {
        console.log("ProcessingQueue: No pending tasks to restore");
      }

      this.initialized = true;
    } catch (error) {
      console.error("ProcessingQueue: Failed to restore from storage", error);
      this.initialized = true;
    }
  }

  /**
   * Apply user settings
   */
  private applySettings(settings: any): void {
    this.maxConcurrentAI = settings.maxConcurrentAI || 2;
    // Settings applied, can be updated at runtime
  }

  /**
   * Update settings at runtime
   */
  async updateSettings(settings: any): Promise<void> {
    await storage.saveSettings(settings);
    this.applySettings(settings);
    console.log(
      `ProcessingQueue: Settings updated - AI Intensity: ${settings.aiIntensity}`
    );
  }

  private getFriendlyTaskName(type: QueuedTask["type"]): string {
    const mapping: Record<string, string> = {
      semantic_extraction: "Extract Semantic Features",
      intent_matching: "Match Page to Intent",
      summarization: "Summarize Page",
      classify_behavior: "Classify Page Behavior",
      generate_intent_label: "Generate Intent Label",
      generate_intent_goal: "Generate Intent Goal",
      generate_intent_summary: "Generate Intent Summary",
      generate_intent_insights: "Generate Intent Insights",
      generate_intent_next_steps: "Generate Intent Next Steps",
      ai_verify_intent_matching: "AI Verify Intent Matching",
      scan_intent_merge_opportunities: "Scan Merge Opportunities",
      merge_intents: "Merge Intents",
      ai_analyze_knowledge_gaps: "Analyze Knowledge Gaps",
      ai_predict_milestone: "Predict Intent Milestone",
      generate_activity_summary: "Generate Activity Summary",
    };

    return (
      mapping[type] ||
      type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }

  private buildTaskSignature(
    type: QueuedTask["type"],
    targetId?: string
  ): string {
    return `${type}::${targetId || "system"}`;
  }

  private async shouldEnqueueTask(
    type: QueuedTask["type"],
    targetId: string | undefined,
    context: { pageTitle?: string; pageUrl?: string }
  ): Promise<{ allow: boolean; existingTaskId?: string; reason?: string }> {
    if (!DEDUPE_ELIGIBLE_TASKS.has(type)) {
      return { allow: true };
    }

    const signature = this.buildTaskSignature(type, targetId);

    const existingQueued = this.queue.find((task) => {
      if (task.type !== type) return false;
      if (task.status === "failed" || task.status === "completed") return false;
      if (!targetId || targetId === "system") {
        return !task.pageId && !task.intentId;
      }
      return task.pageId === targetId || task.intentId === targetId;
    });

    if (existingQueued) {
      return {
        allow: false,
        existingTaskId: existingQueued.id,
        reason: "Task already queued",
      };
    }

    const recent = this.recentTaskHistory.get(signature);
    if (!recent) {
      return { allow: true };
    }

    const elapsedMs = Date.now() - recent.completedAt;
    if (elapsedMs > 15 * 60 * 1000) {
      // Allow rerun after 15 minutes regardless
      return { allow: true };
    }

    const elapsedSeconds = Math.max(Math.round(elapsedMs / 1000), 1);

    try {
      await aiPipeline.initialize();
    } catch (error) {
      console.warn(
        "ProcessingQueue: AI dedupe check initialization failed",
        error
      );
    }

    if (aiPipeline.isAvailable()) {
      try {
        const session = await aiPipeline.getSession({
          temperature: 0.2,
          topK: 1,
        });

        const recentSummary = recent.structuredOutput
          ? JSON.stringify(recent.structuredOutput).slice(0, 400)
          : "(no structured output)";

        const prompt = `Decide if we should rerun a background task.

TASK TYPE: ${type}
FRIENDLY NAME: ${recent.friendlyName}
TARGET: ${targetId || "system"}
SECONDS SINCE LAST RUN: ${elapsedSeconds}
PAGE TITLE: ${context.pageTitle || "(none)"}
PAGE URL: ${context.pageUrl || "(none)"}
LAST OUTPUT SUMMARY: ${recentSummary}

Return ONLY valid JSON:
{
  "shouldRun": true,
  "confidence": 0.0,
  "reason": "Concise explanation"
}`;

        const response = await session.prompt(prompt);
        const cleaned = response
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/i, "");
        const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

        if (parsed && parsed.shouldRun === false) {
          return {
            allow: false,
            reason:
              typeof parsed.reason === "string"
                ? parsed.reason
                : "AI suggests skipping duplicate task",
          };
        }
      } catch (error) {
        console.warn("ProcessingQueue: AI dedupe decision failed", error);
      }
    }

    // Fallback heuristic: skip if last run was under 2 minutes ago
    if (elapsedMs < 2 * 60 * 1000) {
      return {
        allow: false,
        reason: "Cooldown: previous run completed under 2 minutes ago",
      };
    }

    return { allow: true };
  }

  private updateRecentHistory(task: QueuedTask): void {
    const targetId = task.intentId || task.pageId || "system";
    const signature = this.buildTaskSignature(task.type, targetId);
    this.recentTaskHistory.set(signature, {
      completedAt: Date.now(),
      structuredOutput: task.structuredOutput,
      friendlyName: task.friendlyName || this.getFriendlyTaskName(task.type),
    });
  }

  /**
   * Persist queue to IndexedDB
   */
  private async persistQueue(): Promise<void> {
    try {
      // Save all tasks in queue
      for (const task of this.queue) {
        await storage.saveQueueTask(task);
      }
    } catch (error) {
      console.error("ProcessingQueue: Failed to persist queue", error);
    }
  }

  /**
   * Add merge task with merge data (prevents duplicate task creation bug)
   */
  async addMergeTask(
    sourceIntentId: string,
    targetIntentId: string,
    priority: number = 25
  ): Promise<void> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if this merge is already queued or processing
    const existing = this.queue.find(
      (t) =>
        t.type === "merge_intents" &&
        t.status !== "completed" &&
        t.status !== "failed" &&
        t.mergeData?.sourceIntentId === sourceIntentId &&
        t.mergeData?.targetIntentId === targetIntentId
    );

    if (existing) {
      console.log(
        `Merge task already exists: ${sourceIntentId} → ${targetIntentId}`
      );
      return;
    }

    const task: QueuedTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "merge_intents",
      intentId: sourceIntentId,
      priority,
      createdAt: Date.now(),
      status: "queued",
      retryCount: 0,
      mergeData: {
        sourceIntentId,
        targetIntentId,
      },
      friendlyName: this.getFriendlyTaskName("merge_intents"),
    };

    this.queue.push(task);

    // Persist to storage
    await this.persistQueue();

    this.notifyListeners();

    console.log(`✓ Queued merge task: ${sourceIntentId} → ${targetIntentId}`);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processNext();
    }
  }

  /**
   * Add task to queue and start processing
   */
  async addTask(
    type: QueuedTask["type"],
    pageIdOrIntentId: string,
    priority: number = 1,
    pageTitle?: string,
    pageUrl?: string,
    dependencies?: string[] // Optional task dependencies
  ): Promise<string> {
    // Return task ID
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Determine if this is a page, intent, or system task
    // PAGE TASKS (need pageId): semantic_extraction, summarization, intent_matching, ai_verify_intent_matching, classify_behavior
    // INTENT TASKS (need intentId): generate_intent_*, scan_intent_merge_opportunities, merge_intents, ai_analyze_knowledge_gaps, ai_predict_milestone
    // SYSTEM TASKS (no pageId/intentId): generate_activity_summary
    const isIntentTask =
      type.startsWith("generate_intent_") ||
      type === "scan_intent_merge_opportunities" ||
      type === "merge_intents" ||
      type === "ai_analyze_knowledge_gaps" ||
      type === "ai_predict_milestone";

    const isSystemTask = type === "generate_activity_summary";

    const targetIdForSignature = isSystemTask ? "system" : pageIdOrIntentId;
    const dedupeDecision = await this.shouldEnqueueTask(
      type,
      targetIdForSignature,
      { pageTitle, pageUrl }
    );

    if (!dedupeDecision.allow) {
      console.log(
        `ProcessingQueue: Skipping ${this.getFriendlyTaskName(
          type
        )} (${type}) for ${targetIdForSignature || "system"} — ${
          dedupeDecision.reason || "duplicate detected"
        }`
      );
      return (
        dedupeDecision.existingTaskId ||
        this.buildTaskSignature(type, targetIdForSignature)
      );
    }

    // Note: ai_verify_intent_matching is a PAGE task (verifies page assignment, needs pageId)

    const task: QueuedTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      ...(isSystemTask
        ? {} // System tasks don't need pageId or intentId
        : isIntentTask
        ? { intentId: pageIdOrIntentId }
        : { pageId: pageIdOrIntentId, pageTitle, pageUrl }),
      priority,
      createdAt: Date.now(),
      status: "queued",
      retryCount: 0,
      dependencies: dependencies || [],
      attempts: [],
      friendlyName: this.getFriendlyTaskName(type),
    };

    this.queue.push(task);
    this.taskMap.set(task.id, task); // Add to task map for quick lookup

    // Rebuild dependency graph
    this.buildDependencyGraph();

    // Persist to storage
    await this.persistQueue();

    this.notifyListeners();

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processNext();
    }

    return task.id; // Return task ID for dependency tracking
  }

  /**
   * Process next task in queue
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing) return;

    // Get highest priority queued task whose dependencies are met
    const nextTask = this.queue
      .filter((t) => t.status === "queued" && this.areAllDependenciesMet(t))
      .sort((a, b) => a.priority - b.priority)[0];

    if (!nextTask) {
      this.isProcessing = false;

      // Check if there are queued tasks with unmet dependencies
      const blockedTasks = this.queue.filter(
        (t) => t.status === "queued" && !this.areAllDependenciesMet(t)
      );

      if (blockedTasks.length > 0) {
        console.log(
          `ProcessingQueue: ${blockedTasks.length} tasks blocked by dependencies`
        );
      }

      return;
    }

    this.isProcessing = true;
    nextTask.status = "processing";
    nextTask.startedAt = Date.now();

    // Persist status change
    await this.persistQueue();
    this.notifyListeners();

    try {
      await this.processTask(nextTask);
      nextTask.status = "completed";
      nextTask.completedAt = Date.now();
      nextTask.durationMs =
        nextTask.completedAt - (nextTask.startedAt || nextTask.createdAt);

      // Track completion
      this.completedTasks.add(nextTask.id);

      console.log(
        `ProcessingQueue: ✓ Completed ${nextTask.type} for ${
          nextTask.pageId || nextTask.intentId
        } (${nextTask.durationMs}ms)`
      );

      // Update averages for ETA prediction
      this.updateAverages(nextTask);

      this.updateRecentHistory(nextTask);

      // Persist completion
      await this.persistQueue();

      // Trigger dependent tasks
      await this.triggerDependentTasks(nextTask.id);

      // Notify UI to refresh
      this.notifyCompletion(nextTask);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`ProcessingQueue: ✗ Failed ${nextTask.type}:`, err);

      nextTask.status = "failed";
      nextTask.completedAt = Date.now();
      nextTask.durationMs =
        nextTask.completedAt - (nextTask.startedAt || nextTask.createdAt);
      nextTask.error = err.message;

      // Classify error type
      const errorType = this.classifyError(err);
      nextTask.errorType = errorType;

      // Record attempt
      if (!nextTask.attempts) {
        nextTask.attempts = [];
      }
      nextTask.attempts.push({
        attemptNumber: nextTask.retryCount + 1,
        timestamp: Date.now(),
        error: err.message,
        errorType,
        durationMs: nextTask.durationMs,
      });

      nextTask.retryCount++;

      // Smart retry logic based on error type
      let shouldRetry = false;
      let retryDelay = 0;

      if (errorType === ERROR_TYPES.PERMANENT) {
        console.log(
          `ProcessingQueue: Permanent error, not retrying: ${err.message}`
        );
        shouldRetry = false;
      } else if (errorType === ERROR_TYPES.DEPENDENCY) {
        console.log(
          `ProcessingQueue: Dependency error, will retry when dependency completes`
        );
        // Don't retry immediately, will be triggered when dependency completes
        shouldRetry = false;
      } else if (
        errorType === ERROR_TYPES.TRANSIENT &&
        nextTask.retryCount < 3
      ) {
        shouldRetry = true;
        // Exponential backoff: 1s, 5s, 15s
        retryDelay = [1000, 5000, 15000][nextTask.retryCount - 1] || 1000;
        console.log(
          `ProcessingQueue: Transient error, retrying ${
            nextTask.type
          } (attempt ${nextTask.retryCount + 1}) after ${retryDelay}ms delay`
        );
      }

      if (shouldRetry) {
        nextTask.status = "queued";
        nextTask.startedAt = undefined;

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        // Task failed permanently, fail all dependents
        await this.failDependentTasks(
          nextTask.id,
          `Dependency failed: ${nextTask.type} - ${err.message}`
        );
      }

      // Persist failure/retry status
      await this.persistQueue();
    }

    this.isProcessing = false;
    this.notifyListeners();

    // Process next task
    setTimeout(() => this.processNext(), 100);
  }

  /**
   * Check if task uses AI
   */
  private isAITask(type: QueuedTask["type"]): boolean {
    return (
      type === "semantic_extraction" ||
      type === "classify_behavior" ||
      type.startsWith("generate_intent_") ||
      type === "ai_verify_intent_matching" ||
      type === "scan_intent_merge_opportunities" ||
      type === "ai_analyze_knowledge_gaps" ||
      type === "ai_predict_milestone" ||
      type === "generate_activity_summary"
    );
  }

  /**
   * Get priority category for task
   */
  private getPriorityCategory(
    priority: number
  ): "critical" | "important" | "background" {
    if (this.PRIORITY_LIMITS.critical.priorities.includes(priority))
      return "critical";
    if (this.PRIORITY_LIMITS.important.priorities.includes(priority))
      return "important";
    return "background";
  }

  /**
   * Wait for available AI slot (global concurrency limiting)
   */
  private async waitForAISlot(): Promise<void> {
    let waitCount = 0;
    while (this.activeAITasks >= this.maxConcurrentAI) {
      if (waitCount === 0) {
        console.log(
          `ProcessingQueue: Waiting for AI slot (${this.activeAITasks}/${this.maxConcurrentAI} active)`
        );
      }
      waitCount++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (waitCount > 0) {
      console.log(
        `ProcessingQueue: AI slot available after ${waitCount * 0.5}s wait`
      );
    }
  }

  /**
   * Wait for available priority-based slot
   */
  private async waitForPrioritySlot(task: QueuedTask): Promise<void> {
    const category = this.getPriorityCategory(task.priority);
    const limit = this.PRIORITY_LIMITS[category].maxConcurrent;

    let waitCount = 0;
    while (this.activePriorityTasks[category] >= limit) {
      if (waitCount === 0) {
        console.log(
          `ProcessingQueue: Waiting for ${category} slot (${this.activePriorityTasks[category]}/${limit} active)`
        );
      }
      waitCount++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Apply temporal smoothing (min delay between AI tasks)
   */
  private async applyTemporalSmoothing(): Promise<void> {
    const MIN_DELAY = 2000; // 2 seconds between AI tasks

    if (this.lastAITaskTime > 0) {
      const timeSinceLastAI = Date.now() - this.lastAITaskTime;
      if (timeSinceLastAI < MIN_DELAY) {
        const waitTime = MIN_DELAY - timeSinceLastAI;
        console.log(
          `ProcessingQueue: Temporal smoothing - waiting ${waitTime}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Classify error type for smart retry logic
   */
  private classifyError(error: Error): ErrorType {
    const message = error.message;

    for (const [pattern, type] of Object.entries(ERROR_CLASSIFICATION)) {
      if (message.includes(pattern)) {
        return type;
      }
    }

    // Default: transient (retry)
    return ERROR_TYPES.TRANSIENT;
  }

  /**
   * Check if all dependencies are met for a task
   */
  private areAllDependenciesMet(task: QueuedTask): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true; // No dependencies
    }

    return task.dependencies.every((depId) => this.completedTasks.has(depId));
  }

  /**
   * Build dependency graph for tasks
   */
  private buildDependencyGraph(): void {
    // Clear existing dependents
    this.queue.forEach((task) => {
      task.dependents = new Set();
    });

    // Build reverse dependencies
    this.queue.forEach((task) => {
      if (task.dependencies) {
        task.dependencies.forEach((depId) => {
          const depTask = this.taskMap.get(depId);
          if (depTask) {
            if (!depTask.dependents) {
              depTask.dependents = new Set();
            }
            depTask.dependents.add(task.id);
          }
        });
      }
    });
  }

  /**
   * Trigger dependent tasks when a task completes
   */
  private async triggerDependentTasks(completedTaskId: string): Promise<void> {
    const completedTask = this.taskMap.get(completedTaskId);
    if (!completedTask || !completedTask.dependents) {
      return;
    }

    console.log(
      `ProcessingQueue: Task ${completedTaskId} completed, checking ${completedTask.dependents.size} dependent tasks`
    );

    for (const dependentId of completedTask.dependents) {
      const dependent = this.taskMap.get(dependentId);
      if (dependent && dependent.status === "queued") {
        if (this.areAllDependenciesMet(dependent)) {
          console.log(
            `ProcessingQueue: All dependencies met for ${dependentId}, can now process`
          );
          // Dependencies met, task will be picked up in next cycle
        }
      }
    }
  }

  /**
   * Fail all dependent tasks when a task fails
   */
  private async failDependentTasks(
    failedTaskId: string,
    reason: string
  ): Promise<void> {
    const visited = new Set<string>();
    const queue: string[] = [failedTaskId];

    while (queue.length > 0) {
      const taskId = queue.shift()!;
      if (visited.has(taskId)) continue;
      visited.add(taskId);

      const task = this.taskMap.get(taskId);
      if (!task || !task.dependents) continue;

      for (const dependentId of task.dependents) {
        const dependent = this.taskMap.get(dependentId);
        if (
          dependent &&
          (dependent.status === "queued" || dependent.status === "processing")
        ) {
          dependent.status = "failed";
          dependent.error = reason;
          dependent.completedAt = Date.now();
          console.log(
            `ProcessingQueue: Failed dependent task ${dependentId}: ${reason}`
          );
          queue.push(dependentId);
        }
      }
    }

    await this.persistQueue();
    this.notifyListeners();
  }

  /**
   * Execute a single task
   */
  private async processTask(task: QueuedTask): Promise<void> {
    // For intent and system tasks, we don't need a page
    const page = task.pageId ? await storage.getPage(task.pageId) : null;

    // System tasks (like generate_activity_summary) don't need page or intent
    const isSystemTask = task.type === "generate_activity_summary";

    if (!task.intentId && !page && !isSystemTask) {
      throw new Error(`Page ${task.pageId} not found`);
    }

    // Resource management for AI tasks
    if (this.isAITask(task.type)) {
      // Wait for available global AI slot
      await this.waitForAISlot();

      // Wait for priority-specific slot
      await this.waitForPrioritySlot(task);

      // Apply temporal smoothing
      await this.applyTemporalSmoothing();

      // Track active AI task (both global and priority-specific)
      this.activeAITasks++;
      const category = this.getPriorityCategory(task.priority);
      this.activePriorityTasks[category]++;

      console.log(
        `ProcessingQueue: Starting ${category} AI task (Global: ${this.activeAITasks}/${this.maxConcurrentAI}, ${category}: ${this.activePriorityTasks[category]}/${this.PRIORITY_LIMITS[category].maxConcurrent})`
      );
    }

    try {
      await this.executeTaskLogic(task, page);
    } finally {
      // Release AI slot (both global and priority-specific)
      if (this.isAITask(task.type)) {
        this.activeAITasks--;
        const category = this.getPriorityCategory(task.priority);
        this.activePriorityTasks[category]--;
        this.lastAITaskTime = Date.now();

        console.log(
          `ProcessingQueue: AI task completed (Global: ${this.activeAITasks}/${this.maxConcurrentAI}, ${category}: ${this.activePriorityTasks[category]}/${this.PRIORITY_LIMITS[category].maxConcurrent})`
        );
      }
    }
  }

  /**
   * Execute task logic (separated for cleaner resource management)
   */
  private async executeTaskLogic(
    task: QueuedTask,
    page: PageData | null
  ): Promise<void> {
    switch (task.type) {
      case "semantic_extraction":
        if (!page) {
          throw new Error(`Page ${task.pageId} not found`);
        }

        if (!page.semanticFeatures) {
          // Capture structured input
          task.structuredInput = {
            title: page.title,
            url: page.url,
            domain: page.metadata.domain,
            contentLength: page.content?.length || 0,
            engagement: page.interactions.engagementScore,
            dwellTime: page.interactions.dwellTime,
            isErrorPage:
              page.metadata.titleContains404 ||
              page.metadata.titleContainsError,
          };

          // Extract with debug info
          const result = await aiPipeline.extractSemanticFeaturesWithDebug(
            page
          );

          // Capture AI execution details (new format)
          task.aiExecution = {
            api: "LanguageModel",
            prompt: result.debug.prompt,
            response: result.debug.response,
            parameters: {
              temperature: 0.7,
              topK: 3,
              model: "Gemini Nano",
            },
          };

          // Capture structured output
          task.structuredOutput = result.features;

          // Legacy support - keep aiDetails for backward compatibility
          task.aiDetails = {
            model: "LanguageModel",
            prompt: result.debug.prompt,
            response: result.debug.response,
            inputLength: result.debug.prompt.length,
            outputLength: result.debug.response.length,
          };

          task.output = result.features;

          // Atomic update - only updates semantic features field
          if (!task.pageId) {
            throw new Error("Page ID required for semantic extraction");
          }

          await storage.updatePageSemanticFeatures(
            task.pageId,
            result.features
          );

          console.log(
            `ProcessingQueue: ✓ Saved semantic features for ${task.pageId}`
          );

          // Update knowledge graph with page data (now that semantic features are available)
          const updatedPage = await storage.getPage(task.pageId);
          if (updatedPage) {
            await knowledgeGraph.updateFromPage(updatedPage);
          }

          // Queue dependent task with explicit dependency
          await this.addTask(
            "intent_matching",
            task.pageId,
            2,
            task.pageTitle,
            task.pageUrl,
            [task.id] // CRITICAL: intent_matching depends on semantic_extraction
          );

          console.log(
            `ProcessingQueue: Queued intent_matching for ${task.pageId} with dependency on ${task.id}`
          );
        }
        break;

      case "classify_behavior": {
        if (!page) throw new Error(`Page ${task.pageId} not found`);

        if (!page.behavioralClass) {
          task.structuredInput = {
            dwellTime: page.interactions.dwellTime,
            scrollDepth: page.interactions.scrollDepth,
            textSelections: page.interactions.textSelections.length,
            engagement: page.interactions.engagementScore,
          };

          const classification = await aiPipeline.classifyBehavior(page);

          task.structuredOutput = classification;
          task.aiExecution = {
            api: "LanguageModel",
            parameters: { model: "Gemini Nano" },
          };

          if (!task.pageId) {
            throw new Error("Page ID required for behavior classification");
          }

          await storage.updatePageBehavior(task.pageId, classification);

          console.log(
            `ProcessingQueue: ✓ Classified behavior for ${task.pageId}: ${classification.primaryBehavior}`
          );
        }
        break;
      }

      case "summarization":
        if (!page) {
          throw new Error(`Page ${task.pageId} not found`);
        }

        if (
          page.content &&
          page.content.length > 5000 &&
          !page.contentSummary
        ) {
          // Capture structured input
          task.structuredInput = {
            contentLength: page.content.length,
            truncatedLength: Math.min(4000, page.content.length),
          };

          // Get summary with debug info
          const result = await aiPipeline.summarizePageWithDebug(page.content);

          // Capture AI execution details
          task.aiExecution = {
            api: "Summarizer",
            response: result.summary,
            parameters: {
              model: "Summarizer API",
              temperature: undefined,
              topK: undefined,
            },
          };

          // Capture structured output
          task.structuredOutput = {
            summary: result.summary,
            originalLength: page.content.length,
            summaryLength: result.summary.length,
            compressionRatio: (
              result.summary.length / page.content.length
            ).toFixed(2),
          };

          // Atomic update - only updates summary field
          if (!task.pageId) {
            throw new Error("Page ID required for summarization");
          }

          await storage.updatePageSummary(task.pageId, result.summary);

          console.log(`ProcessingQueue: ✓ Saved summary for ${task.pageId}`);
        }
        break;

      case "intent_matching": {
        if (!task.pageId) {
          throw new Error("Page ID required for intent matching");
        }

        // Reload page to ensure we have latest semantic features
        const freshPage = await storage.getPage(task.pageId);
        if (!freshPage) {
          throw new Error(`Page ${task.pageId} not found`);
        }

        if (!freshPage.semanticFeatures) {
          // Dependencies not ready - requeue to end of queue instead of failing
          console.warn(
            `ProcessingQueue: Semantic features not ready for ${
              task.pageId
            }, requeueing to end (attempt ${task.retryCount + 1})`
          );

          // Remove from current position
          const taskIndex = this.queue.findIndex((t) => t.id === task.id);
          if (taskIndex >= 0) {
            this.queue.splice(taskIndex, 1);
          }

          // Requeue to end with same priority (will process after other tasks)
          task.status = "queued";
          task.retryCount++;
          task.startedAt = undefined;

          // Only retry 3 times total
          if (task.retryCount < 3) {
            this.queue.push(task);
            await this.persistQueue();
            return; // Don't throw error, just requeue
          } else {
            throw new Error(
              `Page ${task.pageId} has no semantic features after ${task.retryCount} attempts - semantic_extraction may have failed`
            );
          }
        }

        // Capture structured input
        task.structuredInput = {
          pageId: freshPage.id,
          title: freshPage.title,
          url: freshPage.url,
          concepts: freshPage.semanticFeatures.concepts.slice(0, 10),
          primaryAction: freshPage.semanticFeatures.intentSignals.primaryAction,
          intentConfidence: freshPage.semanticFeatures.intentSignals.confidence,
          hasEmbedding: !!freshPage.embedding,
        };

        // No AI call for intent matching - uses algorithmic similarity
        task.aiExecution = {
          api: "none",
          parameters: {
            model: "Semantic Similarity Engine",
          },
        };

        // Dynamic import to avoid circular dependency
        const { intentEngine } = await import("./intent-engine");
        const intentId = await intentEngine.matchPageToIntentWithDebug(
          freshPage
        );

        // Capture structured output
        task.structuredOutput = {
          intentId,
          assigned: !!freshPage.intentAssignments.primary,
          confidence: freshPage.intentAssignments.primary?.confidence || 0,
          autoAssigned:
            freshPage.intentAssignments.primary?.autoAssigned || false,
        };

        // Legacy support
        task.input = task.structuredInput;
        task.output = task.structuredOutput;
        break;
      }

      case "generate_intent_label":
      case "generate_intent_goal":
      case "generate_intent_summary":
      case "generate_intent_insights":
      case "generate_intent_next_steps": {
        if (!task.intentId) {
          throw new Error("Intent ID required for intent generation tasks");
        }

        const intent = await storage.getIntent(task.intentId);
        if (!intent) {
          throw new Error(`Intent ${task.intentId} not found`);
        }

        const intentPages = await storage.getPagesByIntent(task.intentId);

        // VALIDATION: Check if we have pages for generation
        if (intentPages.length === 0 && intent.pageIds.length > 0) {
          // Intent claims to have pages but we can't retrieve them
          // This might be a timing/race condition issue
          console.warn(
            `Intent ${task.intentId} claims ${intent.pageIds.length} pages but 0 retrieved. Retrying...`
          );

          // Try fetching individual pages
          const pages = [];
          for (const pageId of intent.pageIds) {
            const page = await storage.getPage(pageId);
            if (page) pages.push(page);
          }

          if (pages.length === 0) {
            throw new Error(
              `No pages found for intent ${task.intentId} (claims ${intent.pageIds.length} pages)`
            );
          }

          console.log(
            `✓ Retrieved ${pages.length}/${intent.pageIds.length} pages individually`
          );
          intentPages.push(...pages);
        }

        // Capture structured input
        task.structuredInput = {
          intentId: intent.id,
          intentLabel: intent.label,
          pageCount: intent.pageCount,
          pagesProvided: intentPages.length,
        };

        // Skip generation if no pages available
        if (intentPages.length === 0) {
          throw new Error("No pages provided for label generation");
        }

        // Dynamic import to avoid circular dependency
        const {
          generateIntentInsights,
          generateNextSteps,
          generateIntentSummary,
          generateIntentGoal,
          isValidIntentLabel,
        } = await import("../services/ai-generator");
        const { aiPipeline } = await import("./ai-pipeline");

        if (task.type === "generate_intent_label") {
          const labelResult = await aiPipeline.generateIntentLabel(intentPages);

          const labelIsValid = isValidIntentLabel(
            labelResult.label,
            intentPages
          );

          if (labelIsValid) {
            intent.previousLabel = intent.label;
            intent.label = labelResult.label;
            intent.labelConfidence = labelResult.confidence;
            intent.labelUpdatedAt = Date.now();
            await storage.saveIntent(intent);

            task.structuredOutput = labelResult;
            task.aiExecution = {
              api: "LanguageModel",
              parameters: { model: "Gemini Nano" },
            };

            console.log(`✓ Generated valid label: "${labelResult.label}"`);

            if (labelResult.confidence > 0.7) {
              console.log("Queueing merge scan after label generation");
              await this.addTask(
                "scan_intent_merge_opportunities",
                intent.id,
                17
              );
            }
          } else {
            const fallback = await buildFallbackIntentLabel(
              intent,
              intentPages
            );

            let resolvedLabel = fallback.label;
            if (!isValidIntentLabel(resolvedLabel, intentPages)) {
              console.warn(
                `ProcessingQueue: AI fallback produced invalid label "${resolvedLabel}". Reverting to heuristic.`
              );
              const heuristic = buildHeuristicFallbackLabel(
                intent,
                intentPages
              );
              resolvedLabel = heuristic.label;
              fallback.confidence = heuristic.confidence;
              fallback.reasoning = heuristic.reasoning;
              fallback.source = "heuristic";
            }

            console.warn(
              `ProcessingQueue: Invalid label "${labelResult.label}". Using ${fallback.source} fallback "${resolvedLabel}"`
            );

            intent.previousLabel = intent.label;
            intent.label = resolvedLabel;
            intent.labelConfidence = Math.min(
              fallback.confidence,
              labelResult.confidence || 0.55
            );
            intent.labelUpdatedAt = Date.now();
            await storage.saveIntent(intent);

            task.structuredOutput = {
              ...labelResult,
              label: resolvedLabel,
              confidence: intent.labelConfidence,
              appliedFallback: true,
              originalLabel: labelResult.label,
              fallbackLabel: resolvedLabel,
              fallbackReason: fallback.reasoning,
              fallbackSource: fallback.source,
            };

            task.aiExecution = {
              api: "LanguageModel",
              parameters: { model: "Gemini Nano" },
              response: labelResult.label,
            };
          }
        } else if (task.type === "generate_intent_goal") {
          const goalResult = await generateIntentGoal(intent, intentPages);
          intent.goal = goalResult.goal;
          intent.goalConfidence = goalResult.confidence;
          intent.goalUpdatedAt = Date.now();
          await storage.saveIntent(intent);

          task.structuredOutput = goalResult;
          task.aiExecution = {
            api: "LanguageModel",
            parameters: { model: "Gemini Nano" },
          };
        } else if (task.type === "generate_intent_summary") {
          const summary = await generateIntentSummary(intent, intentPages);
          intent.aiSummary = summary;
          await storage.saveIntent(intent);

          task.structuredOutput = { summary, length: summary.length };
          task.aiExecution = {
            api: "LanguageModel",
            parameters: { model: "Gemini Nano" },
          };
        } else if (task.type === "generate_intent_insights") {
          const insights = await generateIntentInsights(intent, intentPages);
          intent.insights = insights;
          await storage.saveIntent(intent);

          task.structuredOutput = { insights, count: insights.length };
          task.aiExecution = {
            api: "LanguageModel",
            parameters: { model: "Gemini Nano" },
          };
        } else if (task.type === "generate_intent_next_steps") {
          const nextSteps = await generateNextSteps(intent, intentPages);
          intent.nextSteps = nextSteps;
          await storage.saveIntent(intent);

          task.structuredOutput = { nextSteps, count: nextSteps.length };
          task.aiExecution = {
            api: "LanguageModel",
            parameters: { model: "Gemini Nano" },
          };
        }
        break;
      }

      case "ai_verify_intent_matching": {
        if (!task.pageId) {
          throw new Error("Page ID required for AI verification");
        }

        const freshPage = await storage.getPage(task.pageId);
        if (!freshPage || !freshPage.intentAssignments.primary) {
          console.warn(
            `ProcessingQueue: Intent verification waiting for assignment on ${
              task.pageId
            } (attempt ${task.retryCount + 1})`
          );

          const taskIndex = this.queue.findIndex((t) => t.id === task.id);
          if (taskIndex >= 0) {
            this.queue.splice(taskIndex, 1);
          }

          task.status = "queued";
          task.retryCount++;
          task.startedAt = undefined;

          if (task.retryCount <= 3) {
            await new Promise((resolve) => setTimeout(resolve, 75));
            this.queue.push(task);
            await this.persistQueue();
            return;
          }

          throw new Error("Page has no intent assignment to verify");
        }

        const currentIntent = await storage.getIntent(
          freshPage.intentAssignments.primary.intentId
        );
        if (!currentIntent) {
          throw new Error("Current intent not found");
        }

        const allIntents = await storage.getRecentIntents(30);

        task.structuredInput = {
          pageId: freshPage.id,
          pageTitle: freshPage.title,
          currentIntentId: currentIntent.id,
          currentIntentLabel: currentIntent.label,
          algorithmicConfidence: freshPage.intentAssignments.primary.confidence,
          needsConfirmation:
            freshPage.intentAssignments.primary.needsConfirmation,
        };

        // Import AI verification function
        const { aiVerifyIntentMatch } = await import(
          "../services/ai-generator"
        );
        const aiDecision = await aiVerifyIntentMatch(
          freshPage,
          currentIntent,
          allIntents
        );

        task.aiExecution = {
          api: "LanguageModel",
          prompt: aiDecision.prompt,
          response: aiDecision.response,
          parameters: { model: "Gemini Nano", temperature: 0.3, topK: 2 },
        };

        task.structuredOutput = {
          action: aiDecision.action,
          confidence: aiDecision.confidence,
          reasoning: aiDecision.reasoning,
          suggestedIntentId: aiDecision.suggestedIntentId,
          intentToMerge: aiDecision.intentToMerge,
          mergeInto: aiDecision.mergeInto,
        };

        console.log(
          `AI Verification: ${aiDecision.action} (${Math.round(
            aiDecision.confidence * 100
          )}%) - ${aiDecision.reasoning}`
        );

        // Execute AI recommendation
        const { intentEngine } = await import("./intent-engine");

        if (
          aiDecision.action === "merge" &&
          aiDecision.intentToMerge &&
          aiDecision.mergeInto
        ) {
          // Queue merge task
          await this.addTask("merge_intents", aiDecision.intentToMerge, 25);
          // Store merge target in task for later use
          const mergeTask = this.queue.find(
            (t) =>
              t.type === "merge_intents" &&
              t.intentId === aiDecision.intentToMerge
          );
          if (mergeTask) {
            mergeTask.mergeData = {
              sourceIntentId: aiDecision.intentToMerge,
              targetIntentId: aiDecision.mergeInto,
            };
          }
        } else if (
          aiDecision.action === "reassign" &&
          aiDecision.suggestedIntentId
        ) {
          await intentEngine.reassignPage(
            freshPage.id,
            aiDecision.suggestedIntentId
          );
        } else if (aiDecision.action === "split") {
          await intentEngine.createNewIntentFromPage(freshPage.id);
        }
        // If "agree", no action needed

        break;
      }

      case "scan_intent_merge_opportunities": {
        // Intent-level merge scanning (not page-centric)
        const allIntents = await storage.getAllIntents();

        task.structuredInput = {
          targetIntentId: task.intentId || "all",
          totalActiveIntents: allIntents.filter(
            (i) => i.status === "active" || i.status === "emerging"
          ).length,
        };

        // Import scan function
        const { scanIntentMergeOpportunities } = await import(
          "../services/ai-generator"
        );

        const scanResult = await scanIntentMergeOpportunities(
          task.intentId || null,
          allIntents
        );

        task.aiExecution = {
          api: "LanguageModel",
          prompt: scanResult.prompt,
          response: scanResult.response,
          parameters: { model: "Gemini Nano", temperature: 0.2, topK: 1 },
        };

        task.structuredOutput = {
          mergesFound: scanResult.merges.length,
          merges: scanResult.merges,
        };

        console.log(
          `Merge Scan: Found ${scanResult.merges.length} merge opportunities`
        );

        // Queue merge tasks for high-confidence suggestions
        // Threshold: 90% (raised from 85% due to AI over-confidence on bad merges)
        for (const merge of scanResult.merges) {
          if (merge.confidence >= 0.9) {
            console.log(
              `Queueing merge: ${merge.intentA} → ${
                merge.intentB
              } (${Math.round(merge.confidence * 100)}%)`
            );
            // Use new addMergeTask method to prevent race conditions
            await this.addMergeTask(merge.intentA, merge.intentB, 25);
          } else if (merge.confidence >= 0.85) {
            console.log(
              `Merge suggestion 85-90% (below auto-merge threshold): ${
                merge.intentA
              } → ${merge.intentB} (${Math.round(merge.confidence * 100)}%)`
            );
            // TODO: Could create nudge for user confirmation at 85-90% range
          } else {
            console.log(
              `Merge suggestion below threshold: ${merge.intentA} → ${
                merge.intentB
              } (${Math.round(merge.confidence * 100)}%)`
            );
          }
        }

        break;
      }

      case "merge_intents": {
        if (!task.intentId || !task.mergeData) {
          throw new Error("Intent ID and merge data required for merge task");
        }

        task.structuredInput = {
          sourceIntentId: task.mergeData.sourceIntentId,
          targetIntentId: task.mergeData.targetIntentId,
        };

        const { intentEngine } = await import("./intent-engine");
        await intentEngine.mergeIntents(
          task.mergeData.sourceIntentId,
          task.mergeData.targetIntentId
        );

        task.structuredOutput = {
          merged: true,
          resultIntentId: task.mergeData.targetIntentId,
        };

        task.aiExecution = {
          api: "none",
          parameters: { model: "Intent Merge Engine" },
        };

        console.log(
          `✓ Merged intent ${task.mergeData.sourceIntentId} into ${task.mergeData.targetIntentId}`
        );
        break;
      }

      case "ai_analyze_knowledge_gaps": {
        if (!task.intentId) {
          throw new Error("Intent ID required for knowledge gap analysis");
        }

        const intent = await storage.getIntent(task.intentId);
        if (!intent) throw new Error(`Intent ${task.intentId} not found`);

        task.structuredInput = {
          intentId: intent.id,
          intentLabel: intent.label,
          pageCount: intent.pageCount,
        };

        await knowledgeGraph.initialize();
        const gaps = knowledgeGraph.getKnowledgeGaps(intent.label);

        task.structuredOutput = { gaps, count: gaps.length };
        task.aiExecution = {
          api: "LanguageModel",
          parameters: { model: "Knowledge Graph" },
        };

        console.log(
          `✓ Analyzed knowledge gaps for ${intent.id}: ${gaps.length} gaps found`
        );
        break;
      }

      case "ai_predict_milestone": {
        if (!task.intentId) {
          throw new Error("Intent ID required for milestone prediction");
        }

        const intent = await storage.getIntent(task.intentId);
        if (!intent) throw new Error(`Intent ${task.intentId} not found`);

        task.structuredInput = {
          intentId: intent.id,
          intentLabel: intent.label,
          pageCount: intent.pageCount,
          browsingStyle: intent.aggregatedSignals.patterns.browsingStyle,
        };

        // Store milestone info in intent progress field
        // For now, we'll just log it - full implementation would update intent.progress

        task.structuredOutput = {
          predicted: true,
          // Milestone data would be stored in intent.progress
        };
        task.aiExecution = {
          api: "LanguageModel",
          parameters: { model: "Gemini Nano" },
        };

        console.log(`✓ Predicted milestone for ${intent.id}`);
        break;
      }

      case "generate_activity_summary": {
        // Generate activity summary for recent browsing
        task.structuredInput = {
          timeRangeHours: 8,
        };

        const defaultTimeRangeMs = 8 * 60 * 60 * 1000;
        const maxLookbackMs = 72 * 60 * 60 * 1000; // up to 3 days fallback
        const allPages = (await storage.getAllPages()).sort((a, b) => b.timestamp - a.timestamp);

        let recentPages = allPages.filter((p) => Date.now() - p.timestamp <= defaultTimeRangeMs);

        if (recentPages.length === 0 && allPages.length > 0) {
          const fallbackRange = Math.min(maxLookbackMs, Date.now() - allPages[allPages.length - 1].timestamp);
          recentPages = allPages.filter((p) => Date.now() - p.timestamp <= fallbackRange);
        }

        const activeIntents = await storage.getActiveIntents();

        const intentMap = new Map(activeIntents.map((intent) => [intent.id, intent]));
        const defaultThemeLabel = "General exploring";
        const themeBuckets = new Map<string, { intentId?: string; pages: typeof recentPages }>();

        for (const page of recentPages) {
          const primaryIntentId = page.intentAssignments.primary?.intentId;
          const intentLabel = primaryIntentId && intentMap.get(primaryIntentId)?.label
            ? intentMap.get(primaryIntentId)!.label
            : defaultThemeLabel;
          if (!themeBuckets.has(intentLabel)) {
            themeBuckets.set(intentLabel, { intentId: primaryIntentId, pages: [] });
          }
          themeBuckets.get(intentLabel)!.pages.push(page);
        }

        if (!themeBuckets.size && recentPages.length > 0) {
          themeBuckets.set(defaultThemeLabel, { pages: recentPages });
        }

        const themeEntries = Array.from(themeBuckets.entries())
          .sort((a, b) => b[1].pages.length - a[1].pages.length)
          .slice(0, 4);
        const themesCount = themeEntries.length;
        const totalSummaryPages = recentPages.length;

        const formatSample = (page: (typeof recentPages)[number]) => {
          const title = page.title?.trim();
          if (title && title.length <= 80) {
            return `- ${title}`;
          }
          const domain = page.metadata?.domain;
          if (domain) {
            return `- ${domain}`;
          }
          try {
            const hostname = new URL(page.url).hostname;
            return `- ${hostname}`;
          } catch {
            return "- recent page";
          }
        };

        const themesForPrompt = themeEntries
          .map(([label, bucket]) => {
            const samples = bucket.pages.slice(0, 3).map(formatSample).join("\n");
            const readableLabel = label === defaultThemeLabel ? "General exploring" : label;
            return `${readableLabel} (${bucket.pages.length} pages):
${samples || "- quick scans"}`;
          })
          .join("\n\n") ||
          "General exploring:\n- light browsing with no strong pattern yet.";

        const fallbackLines = themesCount
          ? themeEntries.map(([label, bucket]) => {
              const pagesInTheme = bucket.pages.length;
              const baseLabel =
                label === defaultThemeLabel
                  ? (pagesInTheme <= 2
                      ? "You skimmed a couple quick reads"
                      : "You hopped between a few topics")
                  : `You spent time on ${label}`;
              if (pagesInTheme <= 2) {
                return `- ${baseLabel}.`;
              }
              const domains = Array.from(
                new Set(
                  bucket.pages
                    .map((page) => page.metadata?.domain)
                    .filter((domain): domain is string => Boolean(domain))
                )
              ).slice(0, 2);
              const detail = domains.length
                ? `, mostly around ${domains.join(" and ")}`
                : "";
              const sentence = `${baseLabel}${detail}`.trim();
              return `- ${sentence}${sentence.endsWith(".") ? '' : '.'}`;
            })
          : ["- Start browsing and I'll nudge you with the highlights."];
        const fallbackSummary = ["Hey, a quick recap:", ...fallbackLines].join("\n");

        let summary = "";
        let usedAI = false;

        if ("LanguageModel" in self) {
          try {
            const session = await LanguageModel.create({
              temperature: 0.6,
              topK: 3,
            });

            const prompt = `You're Bryn, a friendly research companion. Craft a short recap of the user's last 8 hours of browsing.

THEMES (each bullet shows recent examples):
${themesForPrompt}

SUMMARY CONTEXT:
- Themes detected: ${themesCount}
- Total pages considered: ${totalSummaryPages}

OUTPUT RULES:
- Start with "Hey, a quick recap:"
- Use a bullet list with one line per theme (each line starts with "-")
- Describe the purpose behind the browsing, not just the sites
- Keep the whole answer under 80 words
- If there is only one theme or fewer than three pages total, keep it to a single short bullet (under 20 words)
- Sound warm and human

Write the recap now.`;

            const response = await session.prompt(prompt);
            summary = response.replace(/```/g, "").trim();
            usedAI = Boolean(summary);
            session.destroy();
          } catch (error) {
            console.warn(
              "AI summary generation failed, using fallback:",
              error
            );
          }
        }

        if (summary) {
          summary = summary.trim();
          if (!summary.toLowerCase().startsWith("hey")) {
            summary = `Hey, a quick recap:
${summary}`;
          }
          if (!summary.includes("-")) {
            summary = `${summary}
- You dipped into a few quick reads.`;
          }
        }

        if (!summary) {
          summary = fallbackSummary;
        }

        await storage.saveActivitySummary({
          id: "latest",
          summary,
          generatedAt: Date.now(),
          timeRangeHours: 8,
          pageCount: recentPages.length,
        });

        task.structuredOutput = {
          summary,
          pageCount: recentPages.length,
          usedAI,
        };
        task.aiExecution = {
          api: usedAI ? "LanguageModel" : "none",
          parameters: { model: usedAI ? "Gemini Nano" : "Fallback" },
        };

        console.log(
          `✓ Generated activity summary: "${summary}" (AI: ${usedAI})`
        );

        try {
          chrome.runtime.sendMessage({
            type: "ACTIVITY_SUMMARY_UPDATED",
            summary,
            timestamp: Date.now(),
          });
        } catch (error) {
          // UI might not be open, that's fine
        }

        break;
      }
    }
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      total: this.queue.length,
      queued: this.queue.filter((t) => t.status === "queued").length,
      processing: this.queue.filter((t) => t.status === "processing").length,
      completed: this.queue.filter((t) => t.status === "completed").length,
      failed: this.queue.filter((t) => t.status === "failed").length,
    };
  }

  /**
   * Get all queued tasks
   */
  getQueue(): QueuedTask[] {
    return [...this.queue];
  }

  /**
   * Clear completed tasks (cleanup)
   */
  async clearCompleted(): Promise<void> {
    this.queue = this.queue.filter(
      (t) => t.status !== "completed" && t.status !== "failed"
    );

    // Also clear from storage
    await storage.clearCompletedQueueTasks();

    this.notifyListeners();
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach((callback) => callback());
  }

  private updateAverages(task: QueuedTask): void {
    if (task.durationMs && task.status === "completed") {
      const avg = this.taskAverages[task.type];
      avg.total += task.durationMs;
      avg.count++;
      // Rolling average (weight recent tasks more)
      if (avg.count <= 20) {
        avg.avg = avg.total / avg.count;
      } else {
        // After 20 samples, use exponential moving average
        avg.avg = avg.avg * 0.9 + task.durationMs * 0.1;
      }
    }
  }

  getTaskETA(task: QueuedTask): number {
    if (task.status === "completed") return 0;

    const avgDuration = this.taskAverages[task.type].avg;

    if (task.status === "processing" && task.startedAt) {
      const elapsed = Date.now() - task.startedAt;
      return Math.max(0, avgDuration - elapsed);
    }

    return avgDuration; // Queued
  }

  getTotalETA(): { ms: number; confidence: "low" | "medium" | "high" } {
    const totalMs = this.queue
      .filter((t) => t.status === "queued" || t.status === "processing")
      .reduce((sum, t) => sum + this.getTaskETA(t), 0);

    // Confidence based on number of historical samples
    const minSampleCount = Math.min(
      this.taskAverages.semantic_extraction.count,
      this.taskAverages.summarization.count,
      this.taskAverages.intent_matching.count
    );

    const confidence =
      minSampleCount === 0 ? "low" : minSampleCount < 5 ? "medium" : "high";

    return { ms: totalMs, confidence };
  }

  getAverages() {
    return {
      semantic_extraction: this.taskAverages.semantic_extraction.avg,
      summarization: this.taskAverages.summarization.avg,
      classify_behavior: this.taskAverages.classify_behavior.avg,
      intent_matching: this.taskAverages.intent_matching.avg,
      generate_intent_label: this.taskAverages.generate_intent_label.avg,
      generate_intent_goal: this.taskAverages.generate_intent_goal.avg,
      generate_intent_summary: this.taskAverages.generate_intent_summary.avg,
      generate_intent_insights: this.taskAverages.generate_intent_insights.avg,
      generate_intent_next_steps:
        this.taskAverages.generate_intent_next_steps.avg,
      ai_verify_intent_matching:
        this.taskAverages.ai_verify_intent_matching.avg,
      scan_intent_merge_opportunities:
        this.taskAverages.scan_intent_merge_opportunities.avg,
      merge_intents: this.taskAverages.merge_intents.avg,
      ai_analyze_knowledge_gaps:
        this.taskAverages.ai_analyze_knowledge_gaps.avg,
      ai_predict_milestone: this.taskAverages.ai_predict_milestone.avg,
      generate_activity_summary:
        this.taskAverages.generate_activity_summary.avg,
      sampleCounts: {
        semantic_extraction: this.taskAverages.semantic_extraction.count,
        summarization: this.taskAverages.summarization.count,
        classify_behavior: this.taskAverages.classify_behavior.count,
        intent_matching: this.taskAverages.intent_matching.count,
        generate_intent_label: this.taskAverages.generate_intent_label.count,
        generate_intent_goal: this.taskAverages.generate_intent_goal.count,
        generate_intent_summary:
          this.taskAverages.generate_intent_summary.count,
        generate_intent_insights:
          this.taskAverages.generate_intent_insights.count,
        generate_intent_next_steps:
          this.taskAverages.generate_intent_next_steps.count,
        ai_verify_intent_matching:
          this.taskAverages.ai_verify_intent_matching.count,
        scan_intent_merge_opportunities:
          this.taskAverages.scan_intent_merge_opportunities.count,
        merge_intents: this.taskAverages.merge_intents.count,
        ai_analyze_knowledge_gaps:
          this.taskAverages.ai_analyze_knowledge_gaps.count,
        ai_predict_milestone: this.taskAverages.ai_predict_milestone.count,
        generate_activity_summary:
          this.taskAverages.generate_activity_summary.count,
      },
    };
  }

  private notifyCompletion(task: QueuedTask): void {
    // Send message to UI to refresh data
    try {
      chrome.runtime.sendMessage({
        type: "QUEUE_TASK_COMPLETED",
        taskType: task.type,
        pageId: task.pageId,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Extension context might be invalid
      console.warn("Failed to send task completion message:", error);
    }
  }
}

export const processingQueue = new ProcessingQueue();
