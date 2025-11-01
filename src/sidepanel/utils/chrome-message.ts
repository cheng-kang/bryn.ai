/**
 * Safely send a message to the service worker with error handling
 * Prevents "Extension context invalidated" errors from breaking the UI
 */
export async function safeSendMessage<T = any>(
  message: any
): Promise<T | null> {
  try {
    // Check if runtime is available
    if (!chrome.runtime?.id) {
      console.warn(
        "Extension context invalidated, message not sent:",
        message.type
      );
      return null;
    }

    const response = await chrome.runtime.sendMessage(message);
    return response as T;
  } catch (error) {
    // Handle connection errors silently
    if (error instanceof Error) {
      if (
        error.message.includes("Extension context invalidated") ||
        error.message.includes("Receiving end does not exist") ||
        error.message.includes("Could not establish connection")
      ) {
        console.warn(
          "Extension connection lost, please refresh:",
          message.type
        );
        return null;
      }
    }

    // Log other errors
    console.error("Message send failed:", message.type, error);
    throw error;
  }
}


