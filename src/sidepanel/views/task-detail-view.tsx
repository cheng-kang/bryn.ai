import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "../components/app-header";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import type { QueuedTask } from "@/core/processing-queue";

interface TaskDetailViewProps {
  taskId: string;
  onBack: () => void;
}

const getStatusIcon = (status: QueuedTask["status"]) => {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    case "processing":
      return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-600" />;
    default:
      return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
};

const getTaskTypeName = (type: string): string => {
  const names: Record<string, string> = {
    semantic_extraction: "Semantic Extraction",
    summarization: "Content Summarization",
    intent_matching: "Intent Matching",
    generate_intent_label: "Generate Intent Label",
    generate_intent_goal: "Generate Intent Goal",
    generate_intent_summary: "Generate Intent Summary",
    generate_intent_insights: "Generate Intent Insights",
    generate_intent_next_steps: "Generate Next Steps",
    ai_verify_intent_matching: "AI Verify Intent Match",
    scan_intent_merge_opportunities: "Scan for Merge Opportunities",
    merge_intents: "Merge Intents",
  };
  return names[type] || type;
};

export function TaskDetailView({ taskId, onBack }: TaskDetailViewProps) {
  const [task, setTask] = useState<QueuedTask | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTask = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GET_QUEUE_STATUS",
        });

        if (response.queueTasks) {
          const foundTask = response.queueTasks.find(
            (t: QueuedTask) => t.id === taskId
          );
          setTask(foundTask || null);
        }
      } catch (error) {
        console.error("Failed to load task:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTask();
  }, [taskId]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <AppHeader showBackButton onBack={onBack} title="Task Details" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <AppHeader showBackButton onBack={onBack} title="Task Not Found" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Task not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        showBackButton
        onBack={onBack}
        title="Task Details"
        subtitle={getTaskTypeName(task.type)}
      />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Status Overview */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-4">
                {getStatusIcon(task.status)}
                <div className="flex-1">
                  <h2 className="text-lg font-semibold">
                    {getTaskTypeName(task.type)}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {task.pageTitle || task.pageId || task.intentId}
                  </p>
                </div>
                <Badge
                  variant={
                    task.status === "completed"
                      ? "default"
                      : task.status === "failed"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {task.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Priority:</span>{" "}
                  <span className="font-medium">P{task.priority}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Retry Count:</span>{" "}
                  <span className="font-medium">{task.retryCount}/3</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>{" "}
                  <span className="font-medium">
                    {new Date(task.createdAt).toLocaleString()}
                  </span>
                </div>
                {task.completedAt && (
                  <div>
                    <span className="text-muted-foreground">Completed:</span>{" "}
                    <span className="font-medium">
                      {new Date(task.completedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {task.durationMs && (
                  <div>
                    <span className="text-muted-foreground">Duration:</span>{" "}
                    <span className="font-medium">
                      {((task.durationMs || 0) / 1000).toFixed(2)}s
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Error Message */}
          {task.error && (
            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-red-600 mb-2">
                  Error Message
                </h3>
                <div className="bg-red-50 dark:bg-red-900/30 p-3 rounded text-sm font-mono break-all">
                  {task.error}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Structured Input */}
          {task.structuredInput && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-2">Structured Input</h3>
                <div className="bg-muted p-3 rounded text-xs font-mono break-all max-h-64 overflow-y-auto">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(task.structuredInput, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Execution Details */}
          {task.aiExecution && task.aiExecution.api !== "none" && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">
                  AI Execution ({task.aiExecution.api})
                </h3>

                {task.aiDetails?.prompt && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">
                      Prompt ({task.aiDetails.inputLength} chars)
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded text-xs font-mono break-all max-h-64 overflow-y-auto">
                      <pre className="whitespace-pre-wrap">
                        {task.aiDetails.prompt}
                      </pre>
                    </div>
                  </div>
                )}

                {task.aiDetails?.response && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">
                      Response ({task.aiDetails.outputLength} chars)
                    </div>
                    <div className="bg-green-50 dark:bg-green-950/30 p-3 rounded text-xs font-mono break-all max-h-64 overflow-y-auto">
                      <pre className="whitespace-pre-wrap">
                        {task.aiDetails.response}
                      </pre>
                    </div>
                  </div>
                )}

                {task.aiExecution.parameters && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">
                      Parameters
                    </div>
                    <div className="bg-muted p-2 rounded text-xs">
                      {JSON.stringify(task.aiExecution.parameters, null, 2)}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Structured Output */}
          {task.structuredOutput && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-2">
                  Structured Output
                </h3>
                <div className="bg-muted p-3 rounded text-xs font-mono break-all max-h-64 overflow-y-auto">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(task.structuredOutput, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
