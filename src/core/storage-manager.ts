import type { IntentAssignments, PageData } from "@/types/page";
import type { Intent } from "@/types/intent";
import type { Nudge } from "@/types/nudge";
import type { StorageStats, IntentRelationship } from "@/types/storage";
import type { UserSettings } from "@/types/settings";
import type { UserKnowledgeGraph } from "@/types/knowledge-graph";
import { DEFAULT_SETTINGS } from "@/types/settings";

const DB_NAME = "BrynAI_DB";
const DB_VERSION = 4; // Incremented for activitySummaries store

class StorageManager {
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log("StorageManager: Database initialized");
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Pages store
        if (!db.objectStoreNames.contains("pages")) {
          const pageStore = db.createObjectStore("pages", { keyPath: "id" });
          pageStore.createIndex("url", "url", { unique: false });
          pageStore.createIndex("timestamp", "timestamp", { unique: false });
          pageStore.createIndex(
            "primaryIntent",
            "intentAssignments.primary.intentId",
            { unique: false }
          );
        }

        // Intents store
        if (!db.objectStoreNames.contains("intents")) {
          const intentStore = db.createObjectStore("intents", {
            keyPath: "id",
          });
          intentStore.createIndex("status", "status", { unique: false });
          intentStore.createIndex("lastUpdated", "lastUpdated", {
            unique: false,
          });
          intentStore.createIndex("firstSeen", "firstSeen", { unique: false });
        }

        // Nudges store
        if (!db.objectStoreNames.contains("nudges")) {
          const nudgeStore = db.createObjectStore("nudges", { keyPath: "id" });
          nudgeStore.createIndex("intentId", "intentId", { unique: false });
          nudgeStore.createIndex("status", "status", { unique: false });
          nudgeStore.createIndex("priority", "priority", { unique: false });
        }

        // Relationships store
        if (!db.objectStoreNames.contains("relationships")) {
          const relStore = db.createObjectStore("relationships", {
            keyPath: "id",
          });
          relStore.createIndex("fromIntent", "fromIntentId", { unique: false });
          relStore.createIndex("toIntent", "toIntentId", { unique: false });
        }

        // Processing Queue store (for persistence across restarts)
        if (!db.objectStoreNames.contains("processingQueue")) {
          const queueStore = db.createObjectStore("processingQueue", {
            keyPath: "id",
          });
          queueStore.createIndex("status", "status", { unique: false });
          queueStore.createIndex("priority", "priority", { unique: false });
          queueStore.createIndex("createdAt", "createdAt", { unique: false });
        }

        // Settings store (user preferences)
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }

        // Knowledge Graph store (user interests, entities, knowledge levels)
        if (!db.objectStoreNames.contains("knowledgeGraph")) {
          db.createObjectStore("knowledgeGraph", { keyPath: "version" });
        }

        // Activity Summaries store (cached AI-generated activity summaries)
        if (!db.objectStoreNames.contains("activitySummaries")) {
          const summaryStore = db.createObjectStore("activitySummaries", {
            keyPath: "id",
          });
          summaryStore.createIndex("generatedAt", "generatedAt", {
            unique: false,
          });
        }
      };
    });
  }

  // Page operations
  async savePage(page: PageData): Promise<PageData> {
    await this.initialize();

    const existingById = page.id ? await this.getPage(page.id) : null;

    if (existingById) {
      const merged = this.applyPageUpdate(existingById, page);
      await this.putPage(merged);
      this.notifyPageUpdate(merged.id);
      return merged;
    }

    // Check for duplicate (same URL within last 30 seconds)
    const recentDuplicate = await this.findRecentPageByURL(page.url, 30000);

    if (recentDuplicate) {
      const merged = this.mergeDuplicatePage(recentDuplicate, page);
      await this.putPage(merged);
      this.notifyPageUpdate(merged.id);
      return merged;
    }

    // New unique page - save and return
    await this.putPage(page);

    // Notify UI of new page
    this.notifyPageAdded(page.id);

    return page; // Return new page
  }

  private async findRecentPageByURL(
    url: string,
    withinMs: number
  ): Promise<PageData | null> {
    await this.initialize();
    const cutoff = Date.now() - withinMs;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("pages", "readonly");
      const store = tx.objectStore("pages");
      const index = store.index("url");
      const request = index.getAll(url);

      request.onsuccess = () => {
        const pages = request.result || [];
        // Find most recent page within time window
        const recent = pages
          .filter((p) => p.timestamp >= cutoff)
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        resolve(recent || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getPage(id: string): Promise<PageData | null> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("pages", "readonly");
      const request = tx.objectStore("pages").get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // Atomic updates to prevent overwriting
  async updatePageSemanticFeatures(
    pageId: string,
    features: any
  ): Promise<void> {
    await this.initialize();
    const page = await this.getPage(pageId);
    if (!page) throw new Error(`Page ${pageId} not found`);

    page.semanticFeatures = features;

    // Direct update without going through savePage (avoids deduplication issues)
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction("pages", "readwrite");
      tx.objectStore("pages").put(page);
      tx.oncomplete = () => {
        console.log(`StorageManager: ✓ Semantic features saved for ${pageId}`);
        resolve();
      };
      tx.onerror = () => {
        console.error(
          `StorageManager: ✗ Failed to save semantic features for ${pageId}`
        );
        reject(tx.error);
      };
    });

    // Additional delay to ensure commit
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async updatePageSummary(pageId: string, summary: string): Promise<void> {
    await this.initialize();
    const page = await this.getPage(pageId);
    if (!page) throw new Error(`Page ${pageId} not found`);

    page.contentSummary = summary;
    page.content = null; // Free memory
    await this.savePage(page);
  }

  async updatePageBehavior(pageId: string, classification: any): Promise<void> {
    await this.initialize();
    const page = await this.getPage(pageId);
    if (!page) throw new Error(`Page ${pageId} not found`);

    page.behavioralClass = classification;

    // Direct update
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction("pages", "readwrite");
      tx.objectStore("pages").put(page);
      tx.oncomplete = () => {
        console.log(
          `StorageManager: ✓ Behavioral classification saved for ${pageId}`
        );
        resolve();
      };
      tx.onerror = () => {
        console.error(
          `StorageManager: ✗ Failed to save behavioral classification for ${pageId}`
        );
        reject(tx.error);
      };
    });
  }

  async updatePageIntentAssignment(
    pageId: string,
    assignment: any
  ): Promise<void> {
    await this.initialize();
    const page = await this.getPage(pageId);
    if (!page) throw new Error(`Page ${pageId} not found`);

    page.intentAssignments = assignment;
    await this.savePage(page);
  }

  private applyPageUpdate(existing: PageData, incoming: PageData): PageData {
    const merged: PageData = {
      ...existing,
      ...incoming,
      metadata: { ...existing.metadata, ...incoming.metadata },
      interactions: incoming.interactions || existing.interactions,
      intentAssignments: this.mergeIntentAssignments(
        existing.intentAssignments,
        incoming.intentAssignments
      ),
    };

    if (!incoming.semanticFeatures && existing.semanticFeatures) {
      merged.semanticFeatures = existing.semanticFeatures;
    }

    if (!incoming.embedding && existing.embedding) {
      merged.embedding = existing.embedding;
    }

    if (!incoming.behavioralClass && existing.behavioralClass) {
      merged.behavioralClass = existing.behavioralClass;
    }

    if (incoming.content === undefined && existing.content !== undefined) {
      merged.content = existing.content;
    }

    if (
      incoming.contentSummary === undefined &&
      existing.contentSummary !== undefined
    ) {
      merged.contentSummary = existing.contentSummary;
    }

    if (incoming.processedAt === undefined && existing.processedAt) {
      merged.processedAt = existing.processedAt;
    }

    if (
      !incoming.metadata.detectedLanguage &&
      existing.metadata.detectedLanguage
    ) {
      merged.metadata.detectedLanguage = existing.metadata.detectedLanguage;
      merged.metadata.languageConfidence = existing.metadata.languageConfidence;
    }

    return merged;
  }

  private mergeDuplicatePage(current: PageData, incoming: PageData): PageData {
    const merged: PageData = { ...current };

    merged.interactions = {
      ...current.interactions,
      dwellTime:
        current.interactions.dwellTime + incoming.interactions.dwellTime,
      scrollDepth: Math.max(
        current.interactions.scrollDepth,
        incoming.interactions.scrollDepth
      ),
      scrollPosition: Math.max(
        current.interactions.scrollPosition,
        incoming.interactions.scrollPosition
      ),
      totalScrollDistance:
        current.interactions.totalScrollDistance +
        incoming.interactions.totalScrollDistance,
      textSelections: [
        ...current.interactions.textSelections,
        ...incoming.interactions.textSelections,
      ],
      engagementScore: Math.max(
        current.interactions.engagementScore,
        incoming.interactions.engagementScore
      ),
      focusedSections: incoming.interactions.focusedSections
        ? [
            ...(current.interactions.focusedSections || []),
            ...incoming.interactions.focusedSections,
          ]
        : current.interactions.focusedSections,
    };

    if (incoming.semanticFeatures) {
      merged.semanticFeatures = incoming.semanticFeatures;
    }

    if (incoming.embedding) {
      merged.embedding = incoming.embedding;
    }

    merged.metadata = { ...current.metadata, ...incoming.metadata };
    merged.intentAssignments = this.mergeIntentAssignments(
      current.intentAssignments,
      incoming.intentAssignments
    );

    if (incoming.behavioralClass) {
      merged.behavioralClass = incoming.behavioralClass;
    }

    if (incoming.content !== undefined) {
      merged.content = incoming.content;
    }

    if (incoming.contentSummary !== undefined) {
      merged.contentSummary = incoming.contentSummary;
    }

    if (incoming.processedAt !== undefined) {
      merged.processedAt = incoming.processedAt;
    }

    return merged;
  }

  private mergeIntentAssignments(
    current: IntentAssignments,
    incoming: IntentAssignments
  ): IntentAssignments {
    if (!incoming) {
      return {
        primary: current?.primary ? { ...current.primary } : null,
        secondary: current?.secondary ? [...current.secondary] : [],
      };
    }

    const currentPrimary = current?.primary || null;
    const incomingPrimary = incoming.primary ?? undefined;

    let primary: IntentAssignments["primary"] = null;

    if (incomingPrimary === null) {
      primary = null;
    } else if (incomingPrimary) {
      primary = { ...incomingPrimary };
    } else {
      primary = currentPrimary ? { ...currentPrimary } : null;
    }

    const secondary = incoming.secondary
      ? [...incoming.secondary]
      : current?.secondary
      ? [...current.secondary]
      : [];

    return {
      primary,
      secondary,
    };
  }

  private async putPage(page: PageData): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction("pages", "readwrite");
      tx.objectStore("pages").put(page);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPagesByIntent(intentId: string): Promise<PageData[]> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("pages", "readonly");
      const index = tx.objectStore("pages").index("primaryIntent");
      const request = index.getAll(intentId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllPages(limit?: number): Promise<PageData[]> {
    await this.initialize();
    const tx = this.db!.transaction("pages", "readonly");
    const store = tx.objectStore("pages");
    const pages: PageData[] = [];

    return new Promise((resolve, reject) => {
      const request = store.openCursor(null, "prev");
      let count = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor && (!limit || count < limit)) {
          pages.push(cursor.value);
          count++;
          cursor.continue();
        } else {
          resolve(pages);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Intent operations
  async saveIntent(intent: Intent): Promise<void> {
    await this.initialize();

    // Check if this is a new intent
    const existing = await this.getIntent(intent.id);
    const isNew = !existing;

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction("intents", "readwrite");
      tx.objectStore("intents").put(intent);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Notify UI
    if (isNew) {
      this.notifyIntentCreated(intent.id);
    } else {
      this.notifyIntentUpdated(intent.id);
    }
  }

  async getIntent(id: string): Promise<Intent | null> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("intents", "readonly");
      const request = tx.objectStore("intents").get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllIntents(): Promise<Intent[]> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("intents", "readonly");
      const request = tx.objectStore("intents").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getRecentIntents(days: number = 30): Promise<Intent[]> {
    await this.initialize();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("intents", "readonly");
      const index = tx.objectStore("intents").index("lastUpdated");
      const range = IDBKeyRange.lowerBound(cutoff);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Nudge operations
  async saveNudge(nudge: Nudge): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("nudges", "readwrite");
      tx.objectStore("nudges").put(nudge);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getNudge(id: string): Promise<Nudge | null> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("nudges", "readonly");
      const request = tx.objectStore("nudges").get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingNudges(): Promise<Nudge[]> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("nudges", "readonly");
      const index = tx.objectStore("nudges").index("status");
      const request = index.getAll("pending");
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllNudges(): Promise<Nudge[]> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("nudges", "readonly");
      const request = tx.objectStore("nudges").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteNudge(id: string): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("nudges", "readwrite");
      tx.objectStore("nudges").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Relationship operations
  async saveRelationship(relationship: IntentRelationship): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("relationships", "readwrite");
      tx.objectStore("relationships").put(relationship);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Statistics
  async getStorageStats(): Promise<StorageStats> {
    await this.initialize();

    const [pages, intents, nudges, activeIntents] = await Promise.all([
      this.getAllPages(),
      this.getAllIntents(),
      this.getAllNudges(),
      this.getActiveIntents(),
    ]);

    const pendingNudges = nudges.filter((n) => n.status === "pending");

    // Find most recent page timestamp
    const lastActivity =
      pages.length > 0 ? Math.max(...pages.map((p) => p.timestamp)) : undefined;

    // Estimate storage (rough calculation)
    const pagesSize = JSON.stringify(pages).length;
    const intentsSize = JSON.stringify(intents).length;
    const nudgesSize = JSON.stringify(nudges).length;
    const usageBytes = pagesSize + intentsSize + nudgesSize;

    return {
      totalPages: pages.length,
      totalIntents: intents.length,
      activeIntents: activeIntents.length,
      totalNudges: nudges.length,
      pendingNudges: pendingNudges.length,
      usageBytes,
      usageMB: usageBytes / (1024 * 1024),
      lastActivity,
    };
  }

  // Processing Queue operations
  async saveQueueTask(task: any): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("processingQueue", "readwrite");
      tx.objectStore("processingQueue").put(task);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getQueueTask(id: string): Promise<any | null> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("processingQueue", "readonly");
      const request = tx.objectStore("processingQueue").get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllQueueTasks(): Promise<any[]> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("processingQueue", "readonly");
      const request = tx.objectStore("processingQueue").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteQueueTask(id: string): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("processingQueue", "readwrite");
      tx.objectStore("processingQueue").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearCompletedQueueTasks(): Promise<void> {
    await this.initialize();
    const allTasks = await this.getAllQueueTasks();
    const completedTasks = allTasks.filter(
      (t) => t.status === "completed" || t.status === "failed"
    );

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("processingQueue", "readwrite");
      const store = tx.objectStore("processingQueue");

      completedTasks.forEach((task) => {
        store.delete(task.id);
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Settings operations
  async getSettings(): Promise<UserSettings> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("settings", "readonly");
      const request = tx.objectStore("settings").get("userSettings");
      request.onsuccess = () => {
        const saved = request.result;
        resolve(saved ? saved.value : DEFAULT_SETTINGS);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("settings", "readwrite");
      tx.objectStore("settings").put({ key: "userSettings", value: settings });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Knowledge Graph operations
  async getKnowledgeGraph(): Promise<UserKnowledgeGraph | null> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("knowledgeGraph", "readonly");
      const store = tx.objectStore("knowledgeGraph");
      const request = store.getAll();

      request.onsuccess = () => {
        const graphs = request.result || [];
        // Get latest version (should only be one)
        resolve(graphs[0] || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveKnowledgeGraph(graph: UserKnowledgeGraph): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("knowledgeGraph", "readwrite");
      tx.objectStore("knowledgeGraph").put(graph);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Activity Summary operations
  async getLatestActivitySummary(): Promise<{
    id: string;
    summary: string;
    generatedAt: number;
    timeRangeHours: number;
    pageCount: number;
  } | null> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("activitySummaries", "readonly");
      const index = tx.objectStore("activitySummaries").index("generatedAt");
      const request = index.openCursor(null, "prev"); // Get most recent

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          resolve(cursor.value);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveActivitySummary(summary: {
    id: string;
    summary: string;
    generatedAt: number;
    timeRangeHours: number;
    pageCount: number;
  }): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("activitySummaries", "readwrite");
      tx.objectStore("activitySummaries").put(summary);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearOldActivitySummaries(
    olderThanMs: number = 24 * 60 * 60 * 1000
  ): Promise<void> {
    await this.initialize();
    const cutoff = Date.now() - olderThanMs;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("activitySummaries", "readwrite");
      const store = tx.objectStore("activitySummaries");
      const index = store.index("generatedAt");
      const request = index.openCursor(IDBKeyRange.upperBound(cutoff));

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Data export/import operations
  async exportAllData(): Promise<string> {
    await this.initialize();

    const pages = await this.getAllPages();
    const intents = await this.getAllIntents();
    const nudges = await this.getAllNudges();
    const queueTasks = await this.getAllQueueTasks();
    const settings = await this.getSettings();
    const knowledgeGraph = await this.getKnowledgeGraph();

    return JSON.stringify(
      {
        version: 1,
        exportedAt: Date.now(),
        exportedBy: "Bryn AI",
        data: {
          pages,
          intents,
          nudges,
          queueTasks,
          settings,
          knowledgeGraph,
        },
      },
      null,
      2
    );
  }

  // Cleanup operations
  async clearAllData(): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        ["pages", "intents", "nudges", "relationships", "processingQueue"],
        "readwrite"
      );
      tx.objectStore("pages").clear();
      tx.objectStore("intents").clear();
      tx.objectStore("nudges").clear();
      tx.objectStore("relationships").clear();
      tx.objectStore("processingQueue").clear();
      // Don't clear settings - preserve user preferences
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Real-time update notifications
  private notifyPageAdded(pageId: string): void {
    try {
      chrome.runtime.sendMessage({
        type: "PAGE_ADDED",
        pageId,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Extension context might be invalid
      console.warn("Failed to send page added message:", error);
    }
  }

  private notifyPageUpdate(pageId: string): void {
    try {
      chrome.runtime.sendMessage({
        type: "PAGE_UPDATED",
        pageId,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn("Failed to send page update message:", error);
    }
  }

  private notifyIntentCreated(intentId: string): void {
    try {
      chrome.runtime.sendMessage({
        type: "INTENT_CREATED",
        intentId,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn("Failed to send intent created message:", error);
    }
  }

  private notifyIntentUpdated(intentId: string): void {
    try {
      chrome.runtime.sendMessage({
        type: "INTENT_UPDATED",
        intentId,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn("Failed to send intent updated message:", error);
    }
  }

  /**
   * Get active intents (visible in main UI)
   * Includes: emerging, active, dormant
   */
  async getActiveIntents(): Promise<Intent[]> {
    const allIntents = await this.getAllIntents();
    return allIntents.filter((i) =>
      ["emerging", "active", "dormant"].includes(i.status)
    );
  }

  /**
   * Get archived intents (terminal states, for history view)
   * Includes: completed, merged, discarded, expired
   */
  async getArchivedIntents(): Promise<Intent[]> {
    const allIntents = await this.getAllIntents();
    return allIntents.filter((i) =>
      ["completed", "merged", "discarded", "expired"].includes(i.status)
    );
  }

  /**
   * Get merged intents only (for debugging merge chains)
   */
  async getMergedIntents(): Promise<Intent[]> {
    const allIntents = await this.getAllIntents();
    return allIntents.filter((i) => i.status === "merged");
  }
}

export const storage = new StorageManager();
