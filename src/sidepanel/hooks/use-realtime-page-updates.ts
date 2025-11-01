import { useEffect, useCallback } from "react";

/**
 * Hook to listen for real-time page updates
 * Specifically for pages being added or updated
 */
export function useRealtimePageUpdates(callback: () => void) {
  const stableCallback = useCallback(callback, [callback]);

  useEffect(() => {
    const handleMessage = (message: any) => {
      // Listen for page-specific events
      if (
        [
          "PAGE_ADDED",
          "PAGE_UPDATED",
          "QUEUE_TASK_COMPLETED", // Tasks affect pages
        ].includes(message.type)
      ) {
        console.log("Page update received:", message.type);
        stableCallback();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [stableCallback]);
}



