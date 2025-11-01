import React, { useState, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Edit2,
  Lightbulb,
  Target,
  CheckCircle,
  Archive,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  Clock,
  XCircle,
} from "lucide-react";
import type { Intent } from "@/types/intent";
import type { PageData } from "@/types/page";
import type { QueuedTask } from "@/core/processing-queue";
import { useRealtimeUpdates } from "../hooks/use-realtime-updates";

interface IntentDetailViewProps {
  intent: Intent;
  onBack: () => void;
  onPageClick?: (pageId: string) => void;
}

export function IntentDetailView({
  intent,
  onBack,
  onPageClick,
}: IntentDetailViewProps) {
  const [pages, setPages] = useState<PageData[]>([]);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState(intent.aiSummary || "");
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [editedGoal, setEditedGoal] = useState(intent.goal || "");
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [isGeneratingSteps, setIsGeneratingSteps] = useState(false);
  const [currentIntent, setCurrentIntent] = useState(intent);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [intentTasks, setIntentTasks] = useState<QueuedTask[]>([]);
  const [queuedTaskTypes, setQueuedTaskTypes] = useState<Set<string>>(
    new Set()
  );

  const loadIntentPages = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_INTENT_PAGES",
        intentId: currentIntent.id,
      });
      if (response.pages) {
        setPages(response.pages);
      }
    } catch (error) {
      console.error("Failed to load intent pages:", error);
    }
  }, [currentIntent.id]);

  const loadIntentTasks = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_QUEUE_STATUS",
      });
      if (response.queueTasks) {
        // Filter tasks for this intent
        const tasksForIntent = response.queueTasks.filter(
          (t: QueuedTask) => t.intentId === currentIntent.id
        );
        setIntentTasks(tasksForIntent);

        // Track which task types are queued/processing
        const queuedTypes = new Set<string>(
          tasksForIntent
            .filter(
              (t: QueuedTask) =>
                t.status === "queued" || t.status === "processing"
            )
            .map((t: QueuedTask) => t.type as string)
        );
        setQueuedTaskTypes(queuedTypes);
      }
    } catch (error) {
      console.error("Failed to load intent tasks:", error);
    }
  }, [currentIntent.id]);

  const refreshIntent = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Refresh intent data
      const response = await chrome.runtime.sendMessage({
        type: "GET_ALL_INTENTS",
      });
      const updated = response.intents?.find((i: Intent) => i.id === intent.id);
      if (updated) {
        setCurrentIntent(updated);
        setEditedSummary(updated.aiSummary || "");
      }

      // Refresh pages and tasks
      await Promise.all([loadIntentPages(), loadIntentTasks()]);
    } catch (error) {
      console.error("Failed to refresh intent:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [intent.id, loadIntentPages, loadIntentTasks]);

  useEffect(() => {
    loadIntentPages();
    loadIntentTasks();
  }, [loadIntentPages, loadIntentTasks]);

  // Real-time updates - refresh when intent/pages/tasks change
  useRealtimeUpdates(refreshIntent);

  const handleSaveSummary = async () => {
    try {
      const updatedIntent = { ...currentIntent, aiSummary: editedSummary };
      await chrome.runtime.sendMessage({
        type: "UPDATE_INTENT",
        intent: updatedIntent,
      });
      setCurrentIntent(updatedIntent);
      setIsEditingSummary(false);
    } catch (error) {
      console.error("Failed to save summary:", error);
    }
  };

  const handleSaveGoal = async () => {
    try {
      const updatedIntent = {
        ...currentIntent,
        goal: editedGoal,
        goalUpdatedAt: Date.now(),
      };
      await chrome.runtime.sendMessage({
        type: "UPDATE_INTENT",
        intent: updatedIntent,
      });
      setCurrentIntent(updatedIntent);
      setIsEditingGoal(false);
    } catch (error) {
      console.error("Failed to save goal:", error);
    }
  };

  const generateAIInsights = async () => {
    if (pages.length === 0) return;

    setIsGeneratingInsights(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GENERATE_INTENT_INSIGHTS",
        intent: currentIntent,
      });

      if (response.insights) {
        // Update local state with new insights
        setCurrentIntent((prev) => ({ ...prev, insights: response.insights }));
      }
    } catch (error) {
      console.error("Failed to generate insights:", error);
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const generateNextSteps = async () => {
    if (pages.length === 0) return;

    setIsGeneratingSteps(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GENERATE_NEXT_STEPS",
        intent: currentIntent,
      });

      if (response.nextSteps) {
        // Update local state with new steps
        setCurrentIntent((prev) => ({
          ...prev,
          nextSteps: response.nextSteps,
        }));
      }
    } catch (error) {
      console.error("Failed to generate next steps:", error);
    } finally {
      setIsGeneratingSteps(false);
    }
  };

  const handleMarkComplete = async () => {
    try {
      const updatedIntent = {
        ...currentIntent,
        status: "completed" as const,
        completedAt: Date.now(),
      };
      await chrome.runtime.sendMessage({
        type: "UPDATE_INTENT",
        intent: updatedIntent,
      });
      onBack();
    } catch (error) {
      console.error("Failed to mark as completed:", error);
    }
  };

  const handleArchive = async () => {
    try {
      const updatedIntent = { ...currentIntent, status: "abandoned" as const };
      await chrome.runtime.sendMessage({
        type: "UPDATE_INTENT",
        intent: updatedIntent,
      });
      onBack();
    } catch (error) {
      console.error("Failed to archive intent:", error);
    }
  };

  const getDynamicPhase = (intent: Intent) => {
    const pageCount = intent.pageCount;

    // Determine phase based on page count
    if (pageCount < 3) return "Discovering";
    if (pageCount < 6) return "Understanding";
    if (pageCount < 10) return "Deep Dive";
    return "Expertise Building";
  };

  const getDynamicMilestones = (intent: Intent) => {
    const pageCount = intent.pageCount;
    const milestones = [
      { label: "Discovering", active: pageCount >= 1 },
      { label: "Understanding", active: pageCount >= 3 },
      { label: "Deep Dive", active: pageCount >= 6 },
      { label: "Mastery", active: pageCount >= 10 },
    ];
    return milestones;
  };

  const handleExportIntent = () => {
    const exportData = {
      intent: currentIntent,
      pages,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `intent-${currentIntent.label
      .toLowerCase()
      .replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getTaskIcon = (status: QueuedTask["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case "processing":
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case "failed":
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3 text-gray-500" />;
    }
  };

  const getTaskTypeName = (type: QueuedTask["type"]) => {
    return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const isContentQueued = (taskType: string) => {
    return queuedTaskTypes.has(taskType);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="border-b bg-background">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={onBack}
                className="p-1 hover:bg-accent rounded-md transition-colors"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <h1 className="text-lg font-semibold">{currentIntent.label}</h1>
            </div>
            <p className="text-xs text-muted-foreground ml-8">
              {currentIntent.pageCount} pages · {currentIntent.status}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshIntent}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* AI Summary Section */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">AI Summary</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsEditingSummary(!isEditingSummary)}
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-4">
              {isEditingSummary ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full p-2 text-sm rounded border"
                    rows={4}
                    value={editedSummary}
                    onChange={(e) => setEditedSummary(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveSummary}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditingSummary(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : currentIntent.aiSummary ? (
                <p className="text-sm leading-relaxed">
                  {currentIntent.aiSummary}
                </p>
              ) : isContentQueued("generate_intent_summary") ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating summary...
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  AI-generated summary will appear here based on your browsing
                  patterns.
                </p>
              )}
            </div>
          </section>

          <Separator />

          {/* Key Insights Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Key Insights</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={generateAIInsights}
                disabled={isGeneratingInsights || pages.length === 0}
              >
                {isGeneratingInsights ? "Generating..." : "Generate with AI"}
              </Button>
            </div>
            <div className="space-y-3">
              {currentIntent.insights && currentIntent.insights.length > 0 ? (
                currentIntent.insights.map((insight) => {
                  const isExpanded = expandedInsight === insight.id;
                  const reasoningPreview = insight.reasoning.substring(0, 60);
                  const needsExpand = insight.reasoning.length > 60;

                  return (
                    <div key={insight.id} className="flex gap-3">
                      <Lightbulb className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{insight.text}</p>

                        {/* Reasoning - Collapsible */}
                        {needsExpand ? (
                          <>
                            {!isExpanded ? (
                              <button
                                onClick={() => setExpandedInsight(insight.id)}
                                className="text-xs text-muted-foreground italic mt-1 hover:underline text-left"
                              >
                                {reasoningPreview}...
                              </button>
                            ) : (
                              <div>
                                <p className="text-xs text-muted-foreground mt-1 italic">
                                  {insight.reasoning}
                                </p>
                                <button
                                  onClick={() => setExpandedInsight(null)}
                                  className="text-xs text-primary hover:underline mt-1"
                                >
                                  Show less
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            {insight.reasoning}
                          </p>
                        )}

                        <Badge
                          className={`mt-1 text-xs ${
                            insight.confidence === "high"
                              ? "bg-green-100 text-green-700"
                              : insight.confidence === "medium"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {insight.confidence} confidence
                        </Badge>
                      </div>
                    </div>
                  );
                })
              ) : isContentQueued("generate_intent_insights") ? (
                <div className="flex gap-3">
                  <Loader2 className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5 animate-spin" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      Generating insights from {currentIntent.pageCount}{" "}
                      pages...
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <Lightbulb className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      AI insights will appear here automatically. Click
                      "Generate with AI" to create them manually.
                    </p>
                  </div>
                </div>
              )}

              <Button
                variant="ghost"
                className="w-full justify-start text-sm text-muted-foreground"
                size="sm"
              >
                ⊕ Add New Insight
              </Button>
            </div>
          </section>

          <Separator />

          {/* Research Goal Section */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Research Goal</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsEditingGoal(!isEditingGoal)}
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4">
              {isEditingGoal ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    className="w-full p-2 text-sm rounded border"
                    value={editedGoal}
                    onChange={(e) => setEditedGoal(e.target.value)}
                    placeholder="To..."
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveGoal}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIsEditingGoal(false);
                        setEditedGoal(currentIntent.goal || "");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : currentIntent.goal ? (
                <p className="text-sm font-medium">{currentIntent.goal}</p>
              ) : isContentQueued("generate_intent_goal") ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Inferring research goal...
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  AI will infer your research goal based on browsing behavior.
                </p>
              )}
            </div>
          </section>

          <Separator />

          {/* Intent Progress Section */}
          <section>
            <h2 className="text-sm font-semibold mb-3">Intent Progress</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {getDynamicPhase(currentIntent)}
                </span>
                <span className="font-medium">{currentIntent.confidence}%</span>
              </div>
              <Progress value={currentIntent.confidence} className="h-2" />
              <div className="flex gap-2 text-xs text-muted-foreground mt-2">
                {getDynamicMilestones(currentIntent).map(
                  (milestone, idx, arr) => (
                    <React.Fragment key={idx}>
                      <span
                        className={
                          milestone.active ? "text-primary font-medium" : ""
                        }
                      >
                        {milestone.label}
                      </span>
                      {idx < arr.length - 1 && <span>→</span>}
                    </React.Fragment>
                  )
                )}
              </div>
            </div>
          </section>

          <Separator />

          {/* Suggested Next Steps */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Suggested Next Steps</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={generateNextSteps}
                disabled={isGeneratingSteps || pages.length === 0}
              >
                {isGeneratingSteps ? "Generating..." : "Generate with AI"}
              </Button>
            </div>
            <div className="space-y-2">
              {currentIntent.nextSteps && currentIntent.nextSteps.length > 0 ? (
                currentIntent.nextSteps.map((step) => {
                  const isExpanded = expandedStep === step.id;
                  const reasoningPreview = (step.reasoning || "").substring(
                    0,
                    50
                  );
                  const needsExpand = (step.reasoning || "").length > 50;

                  return (
                    <Card
                      key={step.id}
                      className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-100/50"
                    >
                      <CardContent className="p-3">
                        <div className="flex gap-2">
                          <Target className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{step.action}</p>
                            {step.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {step.description}
                              </p>
                            )}

                            {/* Reasoning - Collapsible */}
                            {step.reasoning && (
                              <div className="mt-1">
                                {needsExpand ? (
                                  <>
                                    {!isExpanded ? (
                                      <button
                                        onClick={() => setExpandedStep(step.id)}
                                        className="text-xs text-muted-foreground/80 italic hover:underline text-left"
                                      >
                                        Why: {reasoningPreview}...
                                      </button>
                                    ) : (
                                      <div>
                                        <p className="text-xs text-muted-foreground/80 italic">
                                          Why: {step.reasoning}
                                        </p>
                                        <button
                                          onClick={() => setExpandedStep(null)}
                                          className="text-xs text-primary hover:underline"
                                        >
                                          Show less
                                        </button>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-xs text-muted-foreground/80 italic">
                                    Why: {step.reasoning}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Action Button */}
                            <button
                              onClick={() => {
                                if (step.url) {
                                  chrome.tabs.create({ url: step.url });
                                } else if (step.query) {
                                  chrome.tabs.create({
                                    url: `https://www.google.com/search?q=${encodeURIComponent(
                                      step.query
                                    )}`,
                                  });
                                }
                              }}
                              className="text-xs text-primary hover:underline mt-2"
                            >
                              Take Action →
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : isContentQueued("generate_intent_next_steps") ? (
                <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/30">
                  <CardContent className="p-3">
                    <div className="flex gap-2">
                      <Loader2 className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5 animate-spin" />
                      <p className="text-sm text-muted-foreground">
                        Generating personalized next steps...
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/30">
                  <CardContent className="p-3">
                    <div className="flex gap-2">
                      <Target className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        Next steps will be generated automatically. Click
                        "Generate with AI" to create them manually.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>

          <Separator />

          {/* Pages in This Intent */}
          <section>
            <h2 className="text-sm font-semibold mb-3">
              Pages in This Intent ({pages.length})
            </h2>
            {pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Pages will appear here as you browse
              </p>
            ) : (
              <div className="space-y-2">
                {pages.map((page) => (
                  <Card key={page.id} className="hover:bg-accent">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium truncate">
                            {page.title}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new URL(page.url).hostname} ·{" "}
                            {new Date(page.timestamp).toLocaleDateString()}
                          </p>
                          <div className="flex gap-3 mt-2">
                            {onPageClick && (
                              <button
                                onClick={() => onPageClick(page.id)}
                                className="text-xs text-primary hover:underline"
                              >
                                View Details →
                              </button>
                            )}
                            <button
                              onClick={() =>
                                chrome.tabs.create({ url: page.url })
                              }
                              className="text-xs text-primary hover:underline"
                            >
                              Open Page →
                            </button>
                          </div>
                        </div>
                        <Badge variant="outline" className="flex-shrink-0">
                          {Math.round(page.interactions.engagementScore * 100)}%
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Processing Tasks for This Intent */}
          {intentTasks.length > 0 && (
            <>
              <section>
                <h2 className="text-sm font-semibold mb-3">
                  Processing History ({intentTasks.length} tasks)
                </h2>
                <div className="space-y-2">
                  {intentTasks
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((task) => (
                      <Card key={task.id}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getTaskIcon(task.status)}
                              <span className="text-sm font-medium">
                                {getTaskTypeName(task.type)}
                              </span>
                            </div>
                            <Badge
                              variant={
                                task.status === "completed"
                                  ? "default"
                                  : task.status === "processing"
                                  ? "secondary"
                                  : task.status === "failed"
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {task.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                            <div>
                              <span className="font-medium">Priority:</span> P
                              {task.priority}
                            </div>
                            <div>
                              <span className="font-medium">Duration:</span>{" "}
                              {task.durationMs ? `${task.durationMs}ms` : "N/A"}
                            </div>
                            <div>
                              <span className="font-medium">Created:</span>{" "}
                              {new Date(task.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                          {task.aiExecution && (
                            <div className="mt-2">
                              <Badge variant="secondary" className="text-xs">
                                {task.aiExecution.api}
                              </Badge>
                            </div>
                          )}
                          {task.error && (
                            <div className="mt-2 text-xs text-destructive">
                              Error: {task.error}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </section>

              <Separator />
            </>
          )}

          {/* Actions & Management */}
          <section>
            <h2 className="text-sm font-semibold mb-3">Actions & Management</h2>
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleMarkComplete}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark as Completed
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleArchive}
              >
                <Archive className="h-4 w-4 mr-2" />
                Archive Intent
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleExportIntent}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Summary
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Intent
              </Button>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
