import { useState, useEffect, useCallback } from "react";
import type { Nudge } from "@/types/nudge";
import { useRealtimeUpdates } from "./use-realtime-updates";

export function useNudges() {
  const [nudges, setNudges] = useState<Nudge[]>([]);

  const loadNudges = useCallback(async () => {
    try {
      // Check if runtime is available
      if (!chrome.runtime?.id) {
        console.warn("Extension context invalidated, skipping nudge load");
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: "GET_PENDING_NUDGES",
      });
      if (response?.nudges) {
        setNudges(response.nudges);
      }
    } catch (error) {
      // Silently handle connection errors
      if (
        error instanceof Error &&
        !error.message.includes("Extension context")
      ) {
        console.error("Failed to load nudges:", error);
      }
    }
  }, []);

  useEffect(() => {
    loadNudges();

    // Fallback polling every 60 seconds (in case messages fail)
    const interval = setInterval(loadNudges, 60000);
    return () => clearInterval(interval);
  }, [loadNudges]);

  // Real-time updates - refresh immediately when data changes
  useRealtimeUpdates(loadNudges);

  const dismissNudge = async (nudgeId: string) => {
    try {
      await chrome.runtime.sendMessage({ type: "DELETE_NUDGE", nudgeId });
      setNudges(nudges.filter((n) => n.id !== nudgeId));
    } catch (error) {
      console.error("Failed to dismiss nudge:", error);
    }
  };

  const snoozeNudge = async (nudgeId: string) => {
    try {
      const nudge = nudges.find((n) => n.id === nudgeId);
      if (!nudge) return;

      nudge.status = "snoozed";
      nudge.timing.snoozedUntil = Date.now() + 60 * 60 * 1000; // 1 hour

      await chrome.runtime.sendMessage({ type: "UPDATE_NUDGE", nudge });
      setNudges(nudges.filter((n) => n.id !== nudgeId));
    } catch (error) {
      console.error("Failed to snooze nudge:", error);
    }
  };

  const followNudge = async (nudgeId: string, action: any) => {
    try {
      const nudge = nudges.find((n) => n.id === nudgeId);
      if (!nudge) return;

      // Execute action if provided
      if (action) {
        if (action.action === "search") {
          const url = `https://www.google.com/search?q=${encodeURIComponent(
            action.payload.query
          )}`;
          chrome.tabs.create({ url });
        } else if (action.action === "open_url") {
          chrome.tabs.create({ url: action.payload.url });
        }
      }

      // Mark as acted
      nudge.status = "acted";
      nudge.timing.respondedAt = Date.now();

      await chrome.runtime.sendMessage({ type: "UPDATE_NUDGE", nudge });
      setNudges(nudges.filter((n) => n.id !== nudgeId));
    } catch (error) {
      console.error("Failed to follow nudge:", error);
    }
  };

  return { nudges, dismissNudge, snoozeNudge, followNudge };
}
