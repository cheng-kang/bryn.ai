import type { PageData } from "@/types/page";
import { aiPipeline } from "@/core/ai-pipeline";
import { intentEngine } from "@/core/intent-engine";
import { storage } from "@/core/storage-manager";
import { processingQueue } from "@/core/processing-queue";
import { nudgeGenerator } from "@/services/nudge-generator";
import {
  generateIntentInsights,
  generateNextSteps,
} from "@/services/ai-generator";

class BackgroundWorker {
  constructor() {
    this.initialize();
  }

  private async initialize() {
    console.log("BrynAI: Initializing...");

    // Initialize AI pipeline
    try {
      await aiPipeline.initialize();
      console.log("BrynAI: ✓ Chrome AI initialized successfully");
    } catch (error) {
      console.error("BrynAI: ✗ Chrome AI initialization failed");
      console.error("Error:", error);
      console.error("\n🔧 SETUP REQUIRED:");
      console.error("1. Ensure Chrome version 128 or higher");
      console.error(
        "2. Check chrome://flags and enable AI features if disabled"
      );
      console.error("3. If model is downloading, wait and reload extension");
      console.error(
        "4. Visit chrome://components and check 'Optimization Guide On Device Model'"
      );
      // Don't throw - allow extension to load but show error in UI
    }

    // Initialize processing queue (restore pending tasks from storage)
    try {
      await processingQueue.initialize();
      console.log("BrynAI: ✓ Processing queue initialized");
    } catch (error) {
      console.error("BrynAI: ✗ Processing queue initialization failed", error);
    }

    // Start resource monitoring
    this.startResourceMonitoring();

    // Inject content scripts into existing tabs (in case of extension reload)
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (
          tab.id &&
          tab.url &&
          (tab.url.startsWith("http://") || tab.url.startsWith("https://"))
        ) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ["src/content-scripts/page-tracker.ts"],
            });
            console.log(`BrynAI: Injected script into existing tab ${tab.id}`);
          } catch (error) {
            // Tab might not allow script injection (chrome://, etc.)
            // Silently ignore
          }
        }
      }
    } catch (error) {
      console.warn("BrynAI: Could not inject into existing tabs:", error);
    }

    // Set up message listeners
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

    // Set up alarms for background jobs
    this.setupAlarms();

    // Open side panel on extension icon click
    chrome.action.onClicked.addListener((tab) => {
      if (tab.windowId) {
        chrome.sidePanel.open({ windowId: tab.windowId });
      }
    });

    console.log("BrynAI: Service worker ready");
  }

  private setupAlarms() {
    // Generate nudges every 6 hours
    chrome.alarms.create("generate-nudges", {
      periodInMinutes: 360,
    });

    // Cleanup/maintenance every 24 hours
    chrome.alarms.create("maintenance", {
      periodInMinutes: 1440,
    });

    // Run knowledge gap analysis every 6 hours
    chrome.alarms.create("analyze-knowledge-gaps", {
      periodInMinutes: 360,
    });

    // Run milestone prediction every 12 hours
    chrome.alarms.create("predict-milestones", {
      periodInMinutes: 720,
    });

    chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));
  }

  private async handleAlarm(alarm: chrome.alarms.Alarm) {
    console.log("BrynAI: Alarm triggered:", alarm.name);

    if (alarm.name === "generate-nudges") {
      await this.generateNudges();
    } else if (alarm.name === "maintenance") {
      await this.runMaintenance();
    } else if (alarm.name === "analyze-knowledge-gaps") {
      await this.analyzeKnowledgeGaps();
    } else if (alarm.name === "predict-milestones") {
      await this.predictMilestones();
    }
  }

  private async generateNudges() {
    try {
      const nudges = await nudgeGenerator.generateNudges();
      console.log(`BrynAI: Generated ${nudges.length} nudges`);
    } catch (error) {
      console.error("BrynAI: Nudge generation failed", error);
    }
  }

  private async runMaintenance() {
    try {
      // Get storage stats
      const stats = await storage.getStorageStats();
      console.log("BrynAI: Storage stats", stats);

      // Clear completed queue tasks from storage (keep last 24 hours)
      await processingQueue.clearCompleted();
      console.log("BrynAI: Cleared completed queue tasks from storage");

      // Clear old activity summaries (keep last 24 hours)
      await storage.clearOldActivitySummaries(24 * 60 * 60 * 1000);
      console.log("BrynAI: Cleared old activity summaries");

      // TODO: Implement compression for old pages
      // TODO: Cleanup completed/abandoned intents older than 90 days
    } catch (error) {
      console.error("BrynAI: Maintenance failed", error);
    }
  }

  private async analyzeKnowledgeGaps() {
    try {
      const intents = await storage.getActiveIntents();
      // Limit to top 3 most active intents to avoid overloading
      const topIntents = intents
        .sort((a, b) => b.lastUpdated - a.lastUpdated)
        .slice(0, 3);

      for (const intent of topIntents) {
        await processingQueue.addTask(
          "ai_analyze_knowledge_gaps",
          intent.id,
          30
        );
      }
      console.log(
        `BrynAI: Queued knowledge gap analysis for ${topIntents.length} intents`
      );
    } catch (error) {
      console.error("BrynAI: Knowledge gap analysis failed", error);
    }
  }

  private async predictMilestones() {
    try {
      const intents = await storage.getActiveIntents();
      // Limit to top 3 most active intents
      const topIntents = intents
        .filter((i) => i.pageCount >= 5) // Only predict for intents with enough data
        .sort((a, b) => b.lastUpdated - a.lastUpdated)
        .slice(0, 3);

      for (const intent of topIntents) {
        await processingQueue.addTask("ai_predict_milestone", intent.id, 31);
      }
      console.log(
        `BrynAI: Queued milestone prediction for ${topIntents.length} intents`
      );
    } catch (error) {
      console.error("BrynAI: Milestone prediction failed", error);
    }
  }

  private startResourceMonitoring(): void {
    // Monitor memory usage every 30 seconds
    setInterval(() => {
      if (typeof performance !== "undefined" && (performance as any).memory) {
        const memory = (performance as any).memory;
        const usedMB = memory.usedJSHeapSize / 1024 / 1024;
        const limitMB = memory.jsHeapSizeLimit / 1024 / 1024;
        const percent = (usedMB / limitMB) * 100;

        console.log(
          `BrynAI Memory: ${usedMB.toFixed(0)}MB / ${limitMB.toFixed(
            0
          )}MB (${percent.toFixed(1)}%)`
        );

        if (percent > 80) {
          console.warn(
            "⚠️ HIGH MEMORY USAGE - Extension using significant resources"
          );
        }

        if (percent > 90) {
          console.error(
            "🔴 CRITICAL MEMORY USAGE - Consider closing tabs or reloading extension"
          );
        }
      }
    }, 30000); // Every 30 seconds
  }

  private handleMessage(
    request: any,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ): boolean {
    // Handle async messages
    (async () => {
      try {
        switch (request.type) {
          case "PAGE_DATA":
            await this.handlePageData(request.data);
            sendResponse({ success: true });
            break;

          case "GET_ACTIVE_INTENTS":
            const intents = await storage.getActiveIntents();
            sendResponse({ intents });
            break;

          case "GET_ALL_INTENTS":
            const allIntents = await storage.getAllIntents();
            sendResponse({ intents: allIntents });
            break;

          case "GET_PENDING_NUDGES":
            const nudges = await storage.getPendingNudges();
            sendResponse({ nudges });
            break;

          case "GET_STORAGE_STATS":
            const stats = await storage.getStorageStats();
            sendResponse({ stats });
            break;

          case "CHECK_AI_STATUS":
            try {
              const isAvailable = aiPipeline.isAvailable();
              const error = aiPipeline.getInitError();
              sendResponse({ isAvailable, error });
            } catch (err) {
              // Fail gracefully if aiPipeline has issues
              sendResponse({
                isAvailable: false,
                error: "Failed to check AI status: " + String(err),
              });
            }
            break;

          case "UPDATE_NUDGE":
            await storage.saveNudge(request.nudge);
            sendResponse({ success: true });
            break;

          case "DELETE_NUDGE":
            await storage.deleteNudge(request.nudgeId);
            sendResponse({ success: true });
            break;

          case "EXPORT_ALL_DATA":
            const exportData = await storage.exportAllData();
            sendResponse({ data: exportData });
            break;

          case "CLEAR_ALL_DATA":
            await storage.clearAllData();
            sendResponse({ success: true });
            break;

          case "UPDATE_INTENT":
            await storage.saveIntent(request.intent);
            sendResponse({ success: true });
            break;

          case "GENERATE_NUDGES":
            await this.generateNudges();
            sendResponse({ success: true });
            break;

          case "GET_INTENT_PAGES":
            const pages = await storage.getPagesByIntent(request.intentId);
            sendResponse({ pages });
            break;

          case "GET_ALL_PAGES":
            const allPages = await storage.getAllPages();
            sendResponse({ pages: allPages });
            break;

          case "GET_QUEUE_STATUS":
            const queueStatus = processingQueue.getStatus();
            const queueTasks = processingQueue.getQueue();
            const eta = processingQueue.getTotalETA();
            const averages = processingQueue.getAverages();
            sendResponse({ queueStatus, queueTasks, eta, averages });
            break;

          case "GET_AI_MODEL_STATUS":
            const modelStatus = {
              languageModel:
                "LanguageModel" in self ? "available" : "unavailable",
              summarizer: "Summarizer" in self ? "available" : "unavailable",
              languageDetector:
                "LanguageDetector" in self ? "available" : "unavailable",
            };
            sendResponse({ modelStatus });
            break;

          case "GENERATE_INTENT_INSIGHTS":
            const intentForInsights = request.intent;
            const pagesForInsights = await storage.getPagesByIntent(
              intentForInsights.id
            );
            const insights = await generateIntentInsights(
              intentForInsights,
              pagesForInsights
            );

            // Update intent with new insights
            intentForInsights.insights = insights;
            await storage.saveIntent(intentForInsights);

            sendResponse({ insights });
            break;

          case "GENERATE_NEXT_STEPS":
            const intentForSteps = request.intent;
            const pagesForSteps = await storage.getPagesByIntent(
              intentForSteps.id
            );
            const nextSteps = await generateNextSteps(
              intentForSteps,
              pagesForSteps
            );

            // Update intent with next steps
            intentForSteps.nextSteps = nextSteps;
            await storage.saveIntent(intentForSteps);

            sendResponse({ nextSteps });
            break;

          case "GET_SETTINGS":
            const settings = await storage.getSettings();
            sendResponse({ settings });
            break;

          case "UPDATE_SETTINGS":
            await storage.saveSettings(request.settings);
            await processingQueue.updateSettings(request.settings);
            sendResponse({ success: true });
            break;

          case "QUEUE_ACTIVITY_SUMMARY":
            // Queue activity summary generation as background task
            await processingQueue.addTask(
              "generate_activity_summary",
              "", // No pageId/intentId needed for system task
              10 // Priority 10 - important but not critical
            );
            sendResponse({ success: true });
            break;

          case "GET_ACTIVITY_SUMMARY": {
            // Get cached activity summary from storage
            const cached = await storage.getLatestActivitySummary();

            // Check if cache is still valid (30 minutes)
            const cacheValidMs = 30 * 60 * 1000;
            const isCacheValid =
              cached && Date.now() - cached.generatedAt < cacheValidMs;

            if (isCacheValid) {
              sendResponse({
                summary: cached.summary,
                generatedAt: cached.generatedAt,
                cached: true,
              });
            } else {
              // Cache expired or missing, return empty and queue generation
              sendResponse({
                summary: "",
                cached: false,
              });

              // Queue new summary generation
              await processingQueue.addTask(
                "generate_activity_summary",
                "",
                10
              );
            }
            break;
          }

          default:
            sendResponse({ error: "Unknown message type" });
        }
      } catch (error) {
        console.error("BrynAI: Message handler error", error);
        sendResponse({ error: String(error) });
      }
    })();

    return true; // Keep channel open for async response
  }

  private async handlePageData(data: Partial<PageData>) {
    // Check if AI is available before processing
    if (!aiPipeline.isAvailable()) {
      console.warn(
        "BrynAI: Skipping page processing - Chrome AI not available"
      );
      return;
    }

    try {
      // Filter out browser internal/warmup pages
      const url = data.url || "";
      const title = data.title || "";

      // Ignore patterns
      const ignoredPatterns = [
        /\/warmup\.html$/i, // Browser warmup pages
        /chrome:\/\//i, // Chrome internal pages
        /chrome-extension:\/\//i, // Extension pages
        /about:blank/i, // Blank pages
        /^data:/i, // Data URLs
      ];

      for (const pattern of ignoredPatterns) {
        if (pattern.test(url)) {
          console.log(`BrynAI: Ignoring internal page: ${title}`);
          return;
        }
      }

      // Generate unique ID
      const pageId = `page-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const pageData: PageData = {
        id: pageId,
        url: data.url!,
        title: data.title!,
        timestamp: data.timestamp || Date.now(),
        content: data.content || null,
        contentSummary: null,
        contentSize: data.contentSize || 0,
        metadata: data.metadata!,
        interactions: data.interactions!,
        intentAssignments: {
          primary: null,
          secondary: [],
        },
      };

      console.log("BrynAI: Processing page:", pageData.title);

      // Process with intent engine
      await intentEngine.processNewPage(pageData);

      console.log("BrynAI: ✓ Page processed successfully");
    } catch (error) {
      console.error("BrynAI: ✗ Failed to process page", error);
    }
  }
}

// Initialize background worker
new BackgroundWorker();
