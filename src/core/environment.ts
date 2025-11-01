/**
 * Environment detection for Chrome Extension contexts
 * Service workers don't have window/document, only self
 */

export function isServiceWorker(): boolean {
  return typeof window === "undefined" && typeof self !== "undefined";
}

export function isBrowserContext(): boolean {
  return typeof window !== "undefined";
}

export function isContentScript(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof chrome !== "undefined" &&
    typeof chrome.runtime !== "undefined"
  );
}

/**
 * Safely check for window-specific APIs
 */
export function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/**
 * Safely check for document
 */
export function hasDocument(): boolean {
  return typeof document !== "undefined";
}

/**
 * Get global context (window in browser, self in service worker)
 */
export function getGlobalContext(): typeof globalThis {
  if (typeof window !== "undefined") {
    return window as any;
  }
  if (typeof self !== "undefined") {
    return self as any;
  }
  return globalThis;
}
