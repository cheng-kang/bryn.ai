import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Activity, ListTree, Map } from "lucide-react";
import { useLiveStatusData } from "./hooks";
import { ResourceMetrics } from "./metrics";
import { StatusLink } from "./tiles";
import type { LiveStatusLinks, LiveStatusVariant } from "./types";

const formatLastActivity = (timestamp: number | undefined): string => {
  if (!timestamp) return "No recent activity";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "Moments ago";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

interface LiveStatusProps {
  variant?: LiveStatusVariant;
  links?: LiveStatusLinks;
}

export function LiveStatus({ variant = "overview", links }: LiveStatusProps) {
  const { storageStats, resourceStats } = useLiveStatusData();
  const processingCount = resourceStats?.processingTasks ?? 0;
  const queuedCount = resourceStats?.queuedTasks ?? 0;
  const queueLabel =
    processingCount > 0
      ? `${processingCount} running${queuedCount > 0 ? ` · ${queuedCount} queued` : ""}`
      : queuedCount > 0
      ? `${queuedCount} queued`
      : "Queue is idle";
  const queueTitle = variant === "diagnostics" ? "Processing Queue" : "Queue Status";

  return (
    <Card>
      <CardContent className="p-4 space-y-5 text-sm">
        <div className="space-y-2">
          <StatusLink
            label={queueTitle}
            value={queueLabel}
            description="See the live queue and what's running."
            icon={<Activity className="h-5 w-5" />}
            onClick={links?.onQueue}
            disabled={!links?.onQueue}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <StatusLink
              label="Identified Intents"
              value={`${storageStats?.activeIntents ?? 0}`}
              description="Browse the intents Bryn is watching."
              icon={<ListTree className="h-5 w-5" />}
              onClick={links?.onIntents}
              disabled={!links?.onIntents}
            />
            <StatusLink
              label="Tracked Pages"
              value={`${storageStats?.totalPages ?? 0}`}
              description="Open the pages feeding your insights."
              icon={<Map className="h-5 w-5" />}
              onClick={links?.onPages}
              disabled={!links?.onPages}
            />
          </div>
        </div>

        <Separator />

        <ResourceMetrics
          cpuUsage={resourceStats?.cpuUsage ?? 0}
          memoryMB={resourceStats?.memoryMB ?? 0}
          memoryLimit={resourceStats?.memoryLimit ?? 0}
          memoryPercent={resourceStats?.memoryPercent ?? 0}
          storageMB={storageStats?.usageMB ?? 0}
        />

        <Separator />

        <div className="text-xs text-muted-foreground">
          Last activity {formatLastActivity(storageStats?.lastActivity)}
        </div>
      </CardContent>
    </Card>
  );
}

export { StatusLink } from "./tiles";
export type { LiveStatusLinks, LiveStatusVariant } from "./types";
