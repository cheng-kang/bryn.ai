import { useEffect, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "../components/app-header";
import { TaskCard } from "../components/task-card";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { QueuedTask } from "@/core/processing-queue";
import type { Intent } from "@/types/intent";
import { useRealtimeUpdates } from "../hooks/use-realtime-updates";

interface TaskQueueViewProps {
  onBack: () => void;
  onPageClick: (pageId: string) => void;
  onIntentClick?: (intentId: string) => void;
  onTaskClick?: (taskId: string) => void;
}

export function TaskQueueView({
  onBack,
  onPageClick,
  onIntentClick,
  onTaskClick,
}: TaskQueueViewProps) {
  const [tasks, setTasks] = useState<QueuedTask[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    try {
      const [queueRes, intentsRes] = await Promise.all([
        chrome.runtime.sendMessage({ type: "GET_QUEUE_STATUS" }),
        chrome.runtime.sendMessage({ type: "GET_ALL_INTENTS" }),
      ]);

      if (queueRes.queueTasks) {
        setTasks(queueRes.queueTasks);
      }

      if (intentsRes.intents) {
        setIntents(intentsRes.intents);
      }
    } catch (error) {
      console.error("Failed to load tasks:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();

    // Fallback polling every 5 seconds (in case messages fail)
    const interval = setInterval(loadTasks, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [loadTasks]);

  // Real-time updates - refresh immediately when tasks complete
  useRealtimeUpdates(loadTasks);

  // Group all tasks by page or intent, unified list ordered by activity
  const groupAllTasks = () => {
    const groups: Record<string, QueuedTask[]> = {};

    tasks.forEach((task) => {
      const key = task.pageId || task.intentId || `system::${task.type}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(task);
    });

    // Convert to array with metadata
    return Object.entries(groups)
      .map(([id, taskList]) => {
        const firstTask = taskList[0];
        const isIntent = !!firstTask.intentId && !firstTask.pageId;
        const isSystem = id.startsWith("system::");
        const taskType = firstTask.type;

        let title = firstTask.pageTitle || id.slice(-8);
        let icon = "📄";

        if (isIntent) {
          const intent = intents.find((i) => i.id === firstTask.intentId);
          title = intent?.label || `Intent Task (${id.slice(-8)})`;
          icon = "🎯";
        } else if (isSystem) {
          title = getTaskTypeName(taskType) || taskType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          icon = "⚙️";
        }

        return {
          id,
          title,
          icon,
          isIntent,
          isSystem,
          tasks: taskList.sort((a, b) => b.createdAt - a.createdAt),
          lastActivity: Math.max(...taskList.map((t) => t.createdAt)),
        };
      })
      .sort((a, b) => b.lastActivity - a.lastActivity); // Sort by most recent activity
  };

  const toggleExpanded = (taskId: string) => {
    const newSet = new Set(expandedTasks);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
    }
    setExpandedTasks(newSet);
  };

    const toTitleCase = (value: string) =>
      value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

  const getStatusIcon = (status: QueuedTask["status"]) => {
    switch (status) {
      case "queued":
        return <Clock className="h-4 w-4 text-gray-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getTaskTypeName = (type: QueuedTask["type"]) => {
    switch (type) {
      case "semantic_extraction":
        return "Semantic Analysis";
      case "summarization":
        return "Content Summary";
      case "intent_matching":
        return "Intent Matching";
      case "generate_intent_label":
        return "Generate Intent Label";
      case "generate_intent_goal":
        return "Generate Goal";
      case "generate_intent_summary":
        return "Generate Summary";
      case "generate_intent_insights":
        return "Generate Insights";
      case "generate_intent_next_steps":
        return "Generate Next Steps";
      case "ai_verify_intent_matching":
        return "AI Verify Intent Match";
      case "scan_intent_merge_opportunities":
        return "Scan Merge Opportunities";
      case "merge_intents":
        return "Merge Intents";
      case "ai_analyze_knowledge_gaps":
        return "Analyze Knowledge Gaps";
      case "ai_predict_milestone":
        return "Predict Intent Milestone";
      case "generate_activity_summary":
        return "Generate Activity Recap";
      default:
        return toTitleCase(type);
    }
  };

  const formatDuration = (ms: number | undefined) => {
    if (!ms) return "N/A";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const allGroups = groupAllTasks();

  // Get currently running tasks, next in queue, and failed tasks
  const runningTasks = tasks.filter((t) => t.status === "processing");
  const failedTasks = tasks.filter((t) => t.status === "failed");
  const nextInQueue = tasks
    .filter((t) => t.status === "queued")
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3); // Show top 3 next tasks

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        showBackButton
        onBack={onBack}
        title="Processing Queue"
        subtitle={
          failedTasks.length > 0
            ? `${tasks.length} tasks (${failedTasks.length} failed) in ${allGroups.length} groups`
            : `${tasks.length} tasks in ${allGroups.length} groups`
        }
      />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tasks in queue. All processing complete!
            </p>
          ) : (
            <>
              {/* Failed, Running & Next in Queue Section */}
              {(failedTasks.length > 0 ||
                runningTasks.length > 0 ||
                nextInQueue.length > 0) && (
                <div className="space-y-3 pb-4 border-b-2">
                  {/* Failed Tasks - Shown First for Visibility */}
                  {failedTasks.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <XCircle className="h-3 w-3 text-red-600" />
                        Failed Tasks ({failedTasks.length})
                      </h3>
                      <div className="space-y-2">
                        {failedTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            variant="failed"
                            isExpanded={expandedTasks.has(task.id)}
                            onToggleExpand={() => toggleExpanded(task.id)}
                            onClick={() => onTaskClick?.(task.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Currently Running */}
                  {runningTasks.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Currently Running ({runningTasks.length})
                      </h3>
                      <div className="space-y-2">
                        {runningTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            variant="running"
                            onClick={() => onTaskClick?.(task.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Next in Queue */}
                  {nextInQueue.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        Next in Queue
                      </h3>
                      <div className="space-y-2">
                        {nextInQueue.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            variant="queued"
                            onClick={() => onTaskClick?.(task.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* All Tasks Grouped */}
              {allGroups.map((group) => (
                <div key={group.id} className="space-y-2">
                  {/* Group Header */}
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <span className="text-base">{group.icon}</span>
                    <h3
                      className="text-sm font-semibold flex-1 truncate cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (group.isIntent && onIntentClick) {
                          onIntentClick(group.id);
                        } else {
                          onPageClick(group.id);
                        }
                      }}
                    >
                      {group.title}
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      {group.tasks.length} tasks
                    </Badge>
                  </div>

                  {/* Tasks for this group */}
                  {group.tasks.map((task) => {
                    const isExpanded = expandedTasks.has(task.id);

                    return (
                      <Card key={task.id}>
                        <CardContent className="p-3">
                          {/* Task Header */}
                          <div
                            className="flex items-start justify-between gap-2 cursor-pointer"
                            onClick={() => toggleExpanded(task.id)}
                          >
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              {getStatusIcon(task.status)}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {getTaskTypeName(task.type)}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {task.pageTitle || task.pageId}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-muted-foreground">
                                    Created:{" "}
                                    {new Date(
                                      task.createdAt
                                    ).toLocaleTimeString()}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    P{task.priority}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
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
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {/* Expanded Details */}
                          {isExpanded && (
                            <div className="mt-3 space-y-3 border-t pt-3">
                              {/* Timing */}
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <div className="text-muted-foreground">
                                    Duration
                                  </div>
                                  <div className="font-medium font-mono">
                                    {formatDuration(task.durationMs)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Retry Count
                                  </div>
                                  <div className="font-medium">
                                    {task.retryCount}
                                  </div>
                                </div>
                              </div>

                              {/* API Used */}
                              {task.aiExecution && (
                                <div>
                                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                                    API Used
                                  </div>
                                  <div className="flex gap-2">
                                    <Badge variant="outline">
                                      {task.aiExecution.api}
                                    </Badge>
                                    {task.aiExecution.parameters?.model && (
                                      <Badge
                                        variant="secondary"
                                        className="text-xs"
                                      >
                                        {task.aiExecution.parameters.model}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Structured Input */}
                              {task.structuredInput && (
                                <div>
                                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                                    Structured Input
                                  </div>
                                  <div className="bg-muted p-2 rounded text-xs font-mono break-all max-h-32 overflow-y-auto">
                                    <pre className="whitespace-pre-wrap">
                                      {JSON.stringify(
                                        task.structuredInput,
                                        null,
                                        2
                                      )}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {/* Legacy Input (fallback) */}
                              {!task.structuredInput && task.input && (
                                <div>
                                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                                    Input
                                  </div>
                                  <div className="bg-muted p-2 rounded text-xs font-mono break-all max-h-32 overflow-y-auto">
                                    <pre className="whitespace-pre-wrap">
                                      {JSON.stringify(task.input, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {/* AI Prompt & Response */}
                              {task.aiExecution?.prompt && (
                                <div>
                                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                                    AI Prompt
                                  </div>
                                  <div className="bg-blue-50 dark:bg-blue-950/30 p-2 rounded text-xs font-mono break-all max-h-48 overflow-y-auto">
                                    <pre className="whitespace-pre-wrap">
                                      {task.aiExecution.prompt}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {task.aiExecution?.response && (
                                <div>
                                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                                    AI Response (
                                    {task.aiExecution.response.length} chars)
                                  </div>
                                  <div className="bg-green-50 dark:bg-green-950/30 p-2 rounded text-xs font-mono break-all max-h-48 overflow-y-auto">
                                    <pre className="whitespace-pre-wrap">
                                      {task.aiExecution.response}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {/* Legacy AI Details (fallback) */}
                              {!task.aiExecution?.prompt &&
                                task.aiDetails?.prompt && (
                                  <>
                                    <div>
                                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                                        AI Prompt ({task.aiDetails.model})
                                      </div>
                                      <div className="bg-blue-50 dark:bg-blue-950/30 p-2 rounded text-xs font-mono break-all max-h-48 overflow-y-auto">
                                        <pre className="whitespace-pre-wrap">
                                          {task.aiDetails.prompt}
                                        </pre>
                                      </div>
                                    </div>

                                    <div>
                                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                                        AI Response (
                                        {task.aiDetails.outputLength} chars)
                                      </div>
                                      <div className="bg-green-50 dark:bg-green-950/30 p-2 rounded text-xs font-mono break-all max-h-48 overflow-y-auto">
                                        <pre className="whitespace-pre-wrap">
                                          {task.aiDetails.response}
                                        </pre>
                                      </div>
                                    </div>
                                  </>
                                )}

                              {/* Structured Output */}
                              {task.structuredOutput && (
                                <div>
                                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                                    Structured Output
                                  </div>
                                  <div className="bg-muted p-2 rounded text-xs font-mono break-all max-h-32 overflow-y-auto">
                                    <pre className="whitespace-pre-wrap">
                                      {JSON.stringify(
                                        task.structuredOutput,
                                        null,
                                        2
                                      )}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {/* Legacy Output (fallback) */}
                              {!task.structuredOutput && task.output && (
                                <div>
                                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                                    Output
                                  </div>
                                  <div className="bg-muted p-2 rounded text-xs font-mono break-all max-h-32 overflow-y-auto">
                                    <pre className="whitespace-pre-wrap">
                                      {JSON.stringify(task.output, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {/* Error (if failed) */}
                              {task.status === "failed" && task.error && (
                                <div>
                                  <div className="text-xs font-semibold text-destructive mb-1">
                                    Error
                                  </div>
                                  <div className="bg-destructive/10 p-2 rounded text-xs text-destructive break-all">
                                    {task.error}
                                  </div>
                                </div>
                              )}

                              {/* Timestamps */}
                              <div>
                                <div className="text-xs font-semibold text-muted-foreground mb-1">
                                  Timeline
                                </div>
                                <div className="space-y-1 text-xs font-mono">
                                  <div>
                                    Queued:{" "}
                                    {new Date(task.createdAt).toLocaleString()}
                                  </div>
                                  {task.startedAt && (
                                    <div>
                                      Started:{" "}
                                      {new Date(
                                        task.startedAt
                                      ).toLocaleString()}
                                    </div>
                                  )}
                                  {task.completedAt && (
                                    <div>
                                      Completed:{" "}
                                      {new Date(
                                        task.completedAt
                                      ).toLocaleString()}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
