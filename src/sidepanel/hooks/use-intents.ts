import { useState, useEffect, useCallback } from "react";
import type { Intent } from "@/types/intent";
import { useRealtimeUpdates } from "./use-realtime-updates";

export function useIntents() {
  const [intents, setIntents] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadIntents = useCallback(async () => {
    try {
      // Check if runtime is available
      if (!chrome.runtime?.id) {
        console.warn("Extension context invalidated, skipping intent load");
        return;
      }

      // Load ALL intents (not just active) to show emerging intents too
      const response = await chrome.runtime.sendMessage({
        type: "GET_ALL_INTENTS",
      });
      if (response?.intents) {
        // Show active and emerging (hide completed/abandoned)
        const visibleIntents = response.intents.filter(
          (i: any) => i.status === "active" || i.status === "emerging"
        );
        setIntents(visibleIntents);
      }
    } catch (error) {
      // Silently handle connection errors (extension context invalidated)
      if (
        error instanceof Error &&
        error.message.includes("Extension context invalidated")
      ) {
        console.warn("Extension reloaded, please refresh the page");
      } else {
        console.error("Failed to load intents:", error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIntents();

    // Fallback polling every 30 seconds (in case messages fail)
    const interval = setInterval(loadIntents, 30000);
    return () => clearInterval(interval);
  }, [loadIntents]);

  // Real-time updates - refresh immediately when data changes
  useRealtimeUpdates(loadIntents);

  return { intents, loading, refresh: loadIntents };
}
