import { useState, useEffect, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { AppHeader } from "./components/app-header";
import { NudgeCard } from "./components/nudge-card";
import { IntentCard } from "./components/intent-card";
import { SettingsActions } from "./components/settings-actions";
import { BackstageView } from "./views/backstage-view";
import { DeveloperHubView } from "./views/developer-hub-view";
import { ScenarioRunnerView } from "./views/scenario-runner-view";
import { AISetupRequired } from "./components/ai-setup-required";
import { IntentDetailView } from "./views/intent-detail-view";
import { AllPagesView } from "./views/all-pages-view";
import { TaskQueueView } from "./views/task-queue-view";
import { PageDetailView } from "./views/page-detail-view";
import { TaskDetailView } from "./views/task-detail-view";
import { IntentLibraryView } from "./views/intent-library-view";
import { HistoryView } from "./views/history-view";
import { useNudges } from "./hooks/use-nudges";
import { useIntents } from "./hooks/use-intents";
import type { Intent } from "@/types/intent";
import type { QueuedTask } from "@/core/processing-queue";

type View =
  | "main"
  | "intent-detail"
  | "all-pages"
  | "all-intents"
  | "task-queue"
  | "page-detail"
  | "task-detail"
  | "backstage"
  | "developer-hub"
  | "scenario-runner"
  | "intent-library"
  | "history";

export default function App() {
  const [viewStack, setViewStack] = useState<View[]>(["main"]);
  const currentView = viewStack[viewStack.length - 1];
  const [selectedIntent, setSelectedIntent] = useState<Intent | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<{
    isAvailable: boolean;
    error: string | null;
  } | null>(null);
  const [queuedTasks, setQueuedTasks] = useState<QueuedTask[]>([]);
  const [activitySummary, setActivitySummary] = useState<string>("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const { nudges, dismissNudge, snoozeNudge, followNudge } = useNudges();
  const { intents } = useIntents();

  const cleanupAfterLeaving = (view: View) => {
    switch (view) {
      case "intent-detail":
        setSelectedIntent(null);
        break;
      case "page-detail":
        setSelectedPageId(null);
        break;
      case "task-detail":
        setSelectedTaskId(null);
        break;
      default:
        break;
    }
  };

  const pushView = (view: View) => {
    setViewStack((stack) => [...stack, view]);
  };

  const popView = () => {
    setViewStack((stack) => {
      if (stack.length <= 1) return stack;
      const popped = stack[stack.length - 1];
      cleanupAfterLeaving(popped);
      return stack.slice(0, -1);
    });
  };

  const intentLabelById = useMemo(() => {
    const map = new Map<string, string>();
    intents.forEach((intent) => map.set(intent.id, intent.label));
    return map;
  }, [intents]);

  const fallbackIntents = useMemo(() => {
    return intents
      .filter((intent) => intent.pageCount > 0)
      .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))
      .slice(0, 2);
  }, [intents]);

  const handleIntentClick = (intent: Intent) => {
    setSelectedIntent(intent);
    pushView("intent-detail");
  };

  const handlePageClick = (pageId: string) => {
    setSelectedPageId(pageId);
    pushView("page-detail");
  };

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    pushView("task-detail");
  };

  useEffect(() => {
    checkAIStatus();
    loadQueuedTasks();

    // Update queued tasks every 5 seconds
    const interval = setInterval(loadQueuedTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentView === "main") {
      loadActivitySummary();

      // Poll for updates every 10 seconds
      const pollInterval = setInterval(loadActivitySummary, 10000);

      // Listen for real-time updates
      const messageListener = (message: any) => {
        if (message.type === "ACTIVITY_SUMMARY_UPDATED") {
          setActivitySummary(message.summary);
          setLoadingSummary(false);
        }
      };
      chrome.runtime.onMessage.addListener(messageListener);

      return () => {
        clearInterval(pollInterval);
        chrome.runtime.onMessage.removeListener(messageListener);
      };
    }
  }, [currentView]);

  const loadActivitySummary = async () => {
    try {
      if (!chrome.runtime?.id) return;

      // Get cached summary from storage (eventual consistency)
      const response = await chrome.runtime.sendMessage({
        type: "GET_ACTIVITY_SUMMARY",
      });

      if (response.summary) {
        // We have a valid cached summary
        setActivitySummary(response.summary);
        setLoadingSummary(false);
      } else if (!response.cached) {
        // Cache expired/missing, generation queued automatically
        // Show placeholder until ready
        setLoadingSummary(true);
      }
    } catch (error) {
      console.error("Failed to load activity summary:", error);
      setLoadingSummary(false);
    }
  };

  const loadQueuedTasks = async () => {
    try {
      if (!chrome.runtime?.id) return;

      const response = await chrome.runtime.sendMessage({
        type: "GET_QUEUE_STATUS",
      });
      if (response?.queueTasks) {
        setQueuedTasks(response.queueTasks);
      }
    } catch (error) {
      // Silently handle errors
    }
  };

  const checkAIStatus = async () => {
    try {
      // Check if runtime is available
      if (!chrome.runtime?.id) {
        setAiStatus({
          isAvailable: false,
          error:
            "Extension context invalidated. Please close and reopen the side panel.",
        });
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: "CHECK_AI_STATUS",
      });
      setAiStatus({
        isAvailable: response?.isAvailable ?? false,
        error: response?.error ?? null,
      });
    } catch (error) {
      console.error("Failed to check AI status:", error);
      const errorMessage =
        error instanceof Error &&
        (error.message.includes("Extension context") ||
          error.message.includes("Receiving end does not exist"))
          ? "Extension reloaded. Please close and reopen the side panel."
          : "Failed to communicate with background worker";

      setAiStatus({
        isAvailable: false,
        error: errorMessage,
      });
    }
  };

  // Show setup screen if AI is not available
  if (aiStatus === null) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Checking AI status...</p>
      </div>
    );
  }

  if (!aiStatus.isAvailable) {
    return (
      <AISetupRequired
        error={aiStatus.error || "Chrome AI is not available"}
        onRetry={checkAIStatus}
      />
    );
  }

  // Render Control Center View
  if (currentView === "backstage") {
    return (
      <BackstageView
        onBack={popView}
        onOpenIntentLibrary={() => pushView("intent-library")}
        onOpenPages={() => pushView("all-pages")}
        onOpenTaskQueue={() => pushView("task-queue")}
      />
    );
  }

  if (currentView === "developer-hub") {
    return (
      <DeveloperHubView
        onBack={popView}
        onOpenTaskQueue={() => pushView("task-queue")}
        onOpenTestRunner={() => pushView("scenario-runner")}
        onOpenIntents={() => pushView("all-intents")}
        onOpenPages={() => pushView("all-pages")}
      />
    );
  }

  if (currentView === "scenario-runner") {
    return (
      <ScenarioRunnerView
        onBack={popView}
        onOpenTaskQueue={() => pushView("task-queue")}
        onOpenIntents={() => pushView("all-intents")}
        onOpenPages={() => pushView("all-pages")}
      />
    );
  }

  // Render Task Queue View
  if (currentView === "task-queue") {
    const handleIntentClickFromId = async (intentId: string) => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GET_ALL_INTENTS",
        });
        const intent = response.intents?.find((i: Intent) => i.id === intentId);
        if (intent) {
          handleIntentClick(intent);
        }
      } catch (error) {
        console.error("Failed to load intent:", error);
      }
    };

    return (
      <TaskQueueView
        onBack={popView}
        onPageClick={handlePageClick}
        onIntentClick={handleIntentClickFromId}
        onTaskClick={handleTaskClick}
      />
    );
  }

  // Render All Pages View
  if (currentView === "all-pages") {
    return <AllPagesView onBack={popView} onPageClick={handlePageClick} />;
  }

  // Render Page Detail View
  if (currentView === "page-detail" && selectedPageId) {
    return <PageDetailView pageId={selectedPageId} onBack={popView} />;
  }

  // Render Task Detail View
  if (currentView === "task-detail" && selectedTaskId) {
    return <TaskDetailView taskId={selectedTaskId} onBack={popView} />;
  }

  // Render Intent Library View
  if (currentView === "intent-library") {
    return (
      <IntentLibraryView onBack={popView} onIntentClick={handleIntentClick} />
    );
  }

  // Render History View
  if (currentView === "history") {
    return <HistoryView onBack={popView} onPageClick={handlePageClick} />;
  }

  // Render All Intents View (reuse intent list)
  if (currentView === "all-intents") {
    return (
      <div className="h-screen flex flex-col bg-background">
        <AppHeader
          showBackButton
          onBack={popView}
          title="All Intents"
          subtitle={`${intents.length} research intents`}
        />
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {intents.map((intent) => {
              const pendingTasksCount = queuedTasks.filter(
                (t) =>
                  t.intentId === intent.id &&
                  (t.status === "queued" || t.status === "processing")
              ).length;

              return (
                <IntentCard
                  key={intent.id}
                  intent={intent}
                  onClick={() => handleIntentClick(intent)}
                  pendingTasks={pendingTasksCount}
                />
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Render Intent Detail View
  if (currentView === "intent-detail" && selectedIntent) {
    return (
      <IntentDetailView
        intent={selectedIntent}
        onBack={popView}
        onPageClick={handlePageClick}
      />
    );
  }

  // Render Main View (Page 1)
  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        showProcessingStatus
        onViewQueue={() => pushView("task-queue")}
      />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-8">
          <section>
            <div className="rounded-2xl border border-muted bg-muted/50 px-4 py-4 shadow-sm">
              {loadingSummary ? (
                <p className="text-sm leading-6 text-foreground">
                  Hey, a quick recap is on the way...
                </p>
              ) : (
                <div className="prose prose-sm prose-headings:mb-1 prose-p:mb-2 prose-li:marker:text-muted-foreground text-foreground">
                  <ReactMarkdown components={{ p: (props) => <p className="mb-2 last:mb-0" {...props} /> }}>
                    {activitySummary ||
                      "Hey, a quick recap will pop up once you browse a little more."}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </section>

          <section>
            {nudges.length > 0 ? (
              <div className="space-y-3">
                {nudges.map((nudge) => (
                  <NudgeCard
                    key={nudge.id}
                    nudge={nudge}
                    intentLabel={intentLabelById.get(nudge.intentId)}
                    onFollow={(action) => followNudge(nudge.id, action)}
                    onSnooze={() => snoozeNudge(nudge.id)}
                    onDismiss={() => dismissNudge(nudge.id)}
                  />
                ))}
              </div>
            ) : fallbackIntents.length > 0 ? (
              <div className="space-y-3">
                {fallbackIntents.map((intent) => (
                  <button
                    key={intent.id}
                    type="button"
                    className="w-full text-left rounded-xl border border-muted bg-background px-4 py-3 shadow-sm transition-colors hover:bg-muted"
                    onClick={() => handleIntentClick(intent)}
                  >
                    <p className="text-sm font-semibold text-foreground">
                      Continue "{intent.label}"
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pick up where you left off with fresh tabs and notes.
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing ready just yet—keep browsing and I’ll tee up the next moves.
              </p>
            )}
          </section>
        </div>
      </ScrollArea>

      <SettingsActions
        onSettingsClick={() => pushView("backstage")}
        onDevToolsClick={() => {
          pushView("developer-hub");
        }}
      />
    </div>
  );
}
