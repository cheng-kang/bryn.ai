import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import type { QueuedTask } from "@/core/processing-queue";

interface QueueViewerProps {
  tasks: QueuedTask[];
}

export function QueueViewer({ tasks }: QueueViewerProps) {
  const toTitleCase = (value: string) =>
    value
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const getStatusIcon = (status: QueuedTask["status"]) => {
    switch (status) {
      case "queued":
        return <Clock className="h-3 w-3 text-gray-500" />;
      case "processing":
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case "failed":
        return <XCircle className="h-3 w-3 text-red-500" />;
    }
  };

  const getTypeName = (type: QueuedTask["type"]) => {
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

  if (tasks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No queued tasks. All processing complete!
      </div>
    );
  }

  // Group tasks by page (or intent for intent-level tasks)
  const tasksByPage = tasks.reduce((acc, task) => {
    const key = task.pageId || task.intentId || `system::${task.type}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(task);
    return acc;
  }, {} as Record<string, QueuedTask[]>);

  const pageGroups = Object.entries(tasksByPage).map(([groupId, pageTasks]) => {
    const firstTask = pageTasks[0];
    const isSystem = groupId.startsWith("system::");
    const title = isSystem
      ? getTypeName(firstTask.type)
      : firstTask.pageTitle || groupId.slice(-8);

    return {
      id: groupId,
      title,
      isSystem,
      tasks: pageTasks,
    };
  });

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto text-sm">
      {pageGroups.map((group) => (
        <div key={group.id} className="border-l-2 border-border pl-2">
          <div className="font-medium text-xs truncate">{group.title}</div>
          <div className="space-y-0.5 mt-1">
            {group.tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 py-0.5">
                {getStatusIcon(task.status)}
                <span className="flex-1 truncate">
                  {getTypeName(task.type)}
                  {task.durationMs && ` (${task.durationMs}ms)`}
                </span>
                {task.status === "failed" && (
                  <span className="text-red-600" title={task.error}>
                    ✗
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
