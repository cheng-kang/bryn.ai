import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { QueuedTask } from "@/core/processing-queue";

interface TaskCardProps {
  task: QueuedTask;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onClick?: () => void;
  variant?: "default" | "failed" | "running" | "queued";
}

const getStatusIcon = (status: QueuedTask["status"]) => {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case "processing":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-600" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
};

const getTaskTypeName = (type: string): string => {
  const names: Record<string, string> = {
    semantic_extraction: "Extract Semantics",
    summarization: "Summarize Content",
    intent_matching: "Match to Intent",
    generate_intent_label: "Generate Label",
    generate_intent_goal: "Generate Goal",
    generate_intent_summary: "Generate Summary",
    generate_intent_insights: "Generate Insights",
    generate_intent_next_steps: "Generate Next Steps",
    ai_verify_intent_matching: "Verify Intent Match",
    scan_intent_merge_opportunities: "Scan for Merges",
    merge_intents: "Merge Intents",
  };
  return names[type] || type;
};

export function TaskCard({
  task,
  isExpanded = false,
  onToggleExpand,
  onClick,
  variant = "default",
}: TaskCardProps) {
  const variantStyles = {
    default: "",
    failed: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
    running: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
    queued:
      "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800",
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else if (onToggleExpand) {
      onToggleExpand();
    }
  };

  return (
    <Card className={variantStyles[variant]}>
      <CardContent className="p-3">
        {/* Default View - Always Visible */}
        <div
          className="flex items-start justify-between gap-2 cursor-pointer"
          onClick={handleCardClick}
        >
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {getStatusIcon(task.status)}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {getTaskTypeName(task.type)}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {task.pageTitle ||
                  task.pageId ||
                  `Intent: ${task.intentId?.slice(-8)}`}
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
              className="text-xs"
            >
              {task.status}
            </Badge>
            <Badge variant="outline" className="text-xs">
              P{task.priority}
            </Badge>
            {onToggleExpand &&
              (isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ))}
          </div>
        </div>

        {/* Expanded View - Show More Details */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Created:</span>{" "}
                <span className="font-medium">
                  {new Date(task.createdAt).toLocaleTimeString()}
                </span>
              </div>
              {task.completedAt && (
                <div>
                  <span className="text-muted-foreground">Duration:</span>{" "}
                  <span className="font-medium">
                    {task.durationMs
                      ? `${((task.durationMs || 0) / 1000).toFixed(2)}s`
                      : "N/A"}
                  </span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Retries:</span>{" "}
                <span className="font-medium">{task.retryCount}/3</span>
              </div>
              {task.startedAt && (
                <div>
                  <span className="text-muted-foreground">Started:</span>{" "}
                  <span className="font-medium">
                    {new Date(task.startedAt).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>

            {task.error && (
              <div className="mt-2">
                <div className="text-xs font-semibold text-muted-foreground mb-1">
                  Error
                </div>
                <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded text-xs font-mono break-all">
                  {task.error}
                </div>
              </div>
            )}

            {task.structuredInput && (
              <div className="mt-2">
                <div className="text-xs font-semibold text-muted-foreground mb-1">
                  Input Summary
                </div>
                <div className="bg-muted p-2 rounded text-xs">
                  {Object.keys(task.structuredInput).slice(0, 3).join(", ")}
                  {Object.keys(task.structuredInput).length > 3 && "..."}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
