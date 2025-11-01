import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { QueuedTask } from "@/core/processing-queue";

interface ProcessingStatusProps {
  onViewQueue?: () => void;
}

export function ProcessingStatus({ onViewQueue }: ProcessingStatusProps) {
  const [status, setStatus] = useState<{
    queued: number;
    processing: number;
  } | null>(null);
  const [tasks, setTasks] = useState<QueuedTask[]>([]);
  const [eta, setEta] = useState<{ ms: number; confidence: string } | null>(
    null
  );

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 2000);

    // Refresh on task completion
    const handleMessage = (message: any) => {
      if (message.type === "QUEUE_TASK_COMPLETED") {
        loadStatus();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const loadStatus = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_QUEUE_STATUS",
      });
      if (response.queueStatus) {
        setStatus({
          queued: response.queueStatus.queued,
          processing: response.queueStatus.processing,
        });
        setTasks(response.queueTasks || []);
        setEta(response.eta || null);
      }
    } catch (error) {
      // Extension context might be invalid
    }
  };

  const formatETA = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  };

  // Count unique pages being processed (not total tasks)
  const uniquePages = new Set(
    tasks
      .filter((t) => t.status === "queued" || t.status === "processing")
      .map((t) => t.pageId)
  ).size;

  const totalTasks = (status?.queued || 0) + (status?.processing || 0);

  // Always show clickable status (even when idle)
  if (!status || uniquePages === 0) {
    return (
      <button
        onClick={onViewQueue}
        className="mt-2 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>✓ All processing complete</span>
        <span className="text-xs opacity-60">→ View queue</span>
      </button>
    );
  }

  return (
    <button
      onClick={onViewQueue}
      className="mt-2 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>
        Processing {uniquePages} page{uniquePages > 1 ? "s" : ""} ({totalTasks}{" "}
        task{totalTasks > 1 ? "s" : ""})
        {eta && eta.ms > 0 && (
          <span className="opacity-75">
            {" "}
            · ETA: ~{formatETA(eta.ms)}
            {eta.confidence === "low" && "*"}
          </span>
        )}
      </span>
    </button>
  );
}
