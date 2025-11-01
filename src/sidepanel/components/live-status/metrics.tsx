import { cn } from "@/lib/utils";

interface ResourceMetricsProps {
  cpuUsage: number;
  memoryMB: number;
  memoryLimit: number;
  memoryPercent: number;
  storageMB: number;
}

function cpuTone(usage: number) {
  if (usage >= 75) return "text-red-600";
  if (usage >= 40) return "text-yellow-600";
  return "text-green-600";
}

function memoryTone(percent: number) {
  if (percent >= 80) return "text-red-600";
  if (percent >= 60) return "text-yellow-600";
  return "text-green-600";
}

export function ResourceMetrics({
  cpuUsage,
  memoryMB,
  memoryLimit,
  memoryPercent,
  storageMB,
}: ResourceMetricsProps) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">CPU</span>
        <span className={cn("font-semibold", cpuTone(cpuUsage))}>{cpuUsage}%</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Memory</span>
        <span className={cn("font-semibold", memoryTone(memoryPercent))}>
          {memoryMB.toFixed(0)} MB / {memoryLimit.toFixed(0)} MB ({Math.round(memoryPercent)}%)
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Storage</span>
        <span className="font-semibold text-foreground">{storageMB.toFixed(2)} MB</span>
      </div>
    </div>
  );
}
