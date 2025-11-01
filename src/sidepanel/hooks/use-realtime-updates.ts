import { useEffect, useCallback } from "react";

/**
 * Hook to listen for real-time updates from background worker
 * Automatically refreshes data when relevant messages are received
 */
export function useRealtimeUpdates(callback: () => void) {
  const stableCallback = useCallback(callback, [callback]);

  useEffect(() => {
    const handleMessage = (message: any) => {
      // Listen for data change events
      if (
        [
          "QUEUE_TASK_COMPLETED",
          "PAGE_ADDED",
          "INTENT_UPDATED",
          "INTENT_CREATED",
          "NUDGE_UPDATED",
        ].includes(message.type)
      ) {
        console.log("Realtime update received:", message.type);
        stableCallback();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [stableCallback]);
}


