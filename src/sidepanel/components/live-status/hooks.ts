import { useCallback, useEffect, useState } from "react";
import type { StorageStats } from "@/types/storage";
import { useRealtimeUpdates } from "../../hooks/use-realtime-updates";
import { useRealtimePageUpdates } from "../../hooks/use-realtime-page-updates";

export interface ResourceStats {
  memoryMB: number;
  memoryPercent: number;
  memoryLimit: number;
  cpuUsage: number;
  processingTasks: number;
  queuedTasks: number;
}

export function useLiveStatusData() {
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [resourceStats, setResourceStats] = useState<ResourceStats | null>(null);

  const loadStorageStats = useCallback(async () => {
    try {
      if (!chrome.runtime?.id) return;
      const response = await chrome.runtime.sendMessage({
        type: "GET_STORAGE_STATS",
      });
      if (response?.stats) {
        setStorageStats(response.stats);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        !error.message.includes("Extension context")
      ) {
        console.error("Failed to load storage stats:", error);
      }
    }
  }, []);

  const loadResourceStats = useCallback(async () => {
    try {
      let memoryMB = 0;
      let memoryPercent = 0;
      let memoryLimit = 0;

      if (typeof performance !== "undefined" && (performance as any).memory) {
        const memory = (performance as any).memory;
        memoryMB = memory.usedJSHeapSize / 1024 / 1024;
        memoryLimit = memory.jsHeapSizeLimit / 1024 / 1024;
        memoryPercent = memoryLimit > 0 ? (memoryMB / memoryLimit) * 100 : 0;
      }

      let cpuUsage = 0;
      if (typeof performance !== "undefined" && performance.now) {
        const start = performance.now();
        let sum = 0;
        for (let i = 0; i < 100000; i++) {
          sum += Math.sqrt(i);
        }
        const end = performance.now();
        cpuUsage = Math.min(100, ((end - start) / 50) * 100);
      }

      let processingTasks = 0;
      let queuedTasks = 0;

      if (chrome.runtime?.id) {
        const response = await chrome.runtime.sendMessage({
          type: "GET_QUEUE_STATUS",
        });

        if (response?.queueTasks) {
          const queueTasks = response.queueTasks as Array<{
            status: string;
          }>;
          processingTasks = queueTasks.filter(
            (task) => task.status === "processing"
          ).length;
          queuedTasks = queueTasks.filter(
            (task) => task.status === "queued"
          ).length;
          cpuUsage = Math.min(100, cpuUsage + processingTasks * 20);
        }
      }

      setResourceStats({
        memoryMB,
        memoryPercent,
        memoryLimit,
        cpuUsage: Math.round(cpuUsage),
        processingTasks,
        queuedTasks,
      });
    } catch (error) {
      // ignore failures quietly; diagnostics are best-effort
    }
  }, []);

  useEffect(() => {
    loadStorageStats();
    loadResourceStats();
    const storageInterval = setInterval(loadStorageStats, 30000);
    const resourceInterval = setInterval(loadResourceStats, 5000);
    return () => {
      clearInterval(storageInterval);
      clearInterval(resourceInterval);
    };
  }, [loadStorageStats, loadResourceStats]);

  useRealtimeUpdates(loadStorageStats);
  useRealtimePageUpdates(loadStorageStats);

  return { storageStats, resourceStats };
}
