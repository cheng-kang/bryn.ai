// Test execution engine - opens real tabs and simulates interactions

import type { TestStep } from "./test-scenarios";

export type LogCallback = (level: string, message: string) => void;

export class TestExecutor {
  private testTabIds: number[] = [];
  private isRunning = false;
  private isPaused = false;
  private onLog: LogCallback;

  constructor(onLog: LogCallback) {
    this.onLog = onLog;
  }

  async executeScenario(steps: TestStep[]): Promise<void> {
    this.isRunning = true;
    this.testTabIds = [];

    try {
      for (let i = 0; i < steps.length; i++) {
        if (!this.isRunning) break;

        while (this.isPaused) {
          await this.sleep(100);
        }

        const step = steps[i];
        await this.executeStep(step);
      }
    } catch (error) {
      this.onLog("ERROR", `Test execution failed: ${error}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private async executeStep(step: TestStep): Promise<void> {
    switch (step.action) {
      case "open":
        await this.handleOpen(step);
        break;
      case "wait":
        await this.handleWait(step);
        break;
      case "close_all":
        await this.handleCloseAll();
        break;
      case "check_popup":
        await this.handleCheckPopup(step);
        break;
      case "set_intent_age":
        await this.handleSetIntentAge(step);
        break;
      case "trigger_nudges":
        await this.handleTriggerNudges();
        break;
    }
  }

  private async handleOpen(step: TestStep): Promise<void> {
    if (!step.url) return;

    this.onLog("ACTION", `Opening ${new URL(step.url).hostname}...`);

    const tab = await chrome.tabs.create({
      url: step.url,
      active: true, // Must be active for proper tracking and simulation
    });

    if (tab.id) {
      this.testTabIds.push(tab.id);

      // Wait for page to load
      await this.waitForTabLoad(tab.id);
      this.onLog("INFO", `Page loaded: ${step.url}`);

      // Wait for content script to initialize (critical!)
      await this.sleep(2000);
      this.onLog("INFO", "Content script ready, starting simulation...");

      // Simulate interactions if specified
      if (step.simulate) {
        await this.simulateInteractions(tab.id, step.simulate);
      }

      // Wait for dwell time
      if (step.duration) {
        this.onLog("INFO", `Dwelling on page for ${step.duration / 1000}s...`);
        await this.sleep(step.duration);
      }
    }
  }

  private async handleWait(step: TestStep): Promise<void> {
    if (!step.duration) return;
    this.onLog("INFO", `Waiting ${step.duration / 1000}s...`);
    await this.sleep(step.duration);
  }

  private async handleCloseAll(): Promise<void> {
    this.onLog("INFO", `Waiting 8 seconds to ensure data is processed...`);

    // Critical: Wait for page-tracker to send data AND background to process
    // Increased from 3s to 8s to allow AI processing time
    await this.sleep(8000);

    this.onLog("ACTION", `Closing ${this.testTabIds.length} test tabs...`);

    for (const tabId of this.testTabIds) {
      try {
        await chrome.tabs.remove(tabId);
      } catch (error) {
        // Tab may already be closed
      }
    }

    this.testTabIds = [];
    this.onLog("SUCCESS", "All test tabs closed");
  }

  private async handleCheckPopup(step: TestStep): Promise<void> {
    this.onLog("INFO", "⚠️ MANUAL VERIFICATION REQUIRED");
    this.onLog("INFO", `Expected: ${step.expected || "See manual checks"}`);
    this.onLog("INFO", "Click the extension icon to open main view and verify");
  }

  private async handleSetIntentAge(step: TestStep): Promise<void> {
    if (step.intentIndex === undefined || step.daysAgo === undefined) return;

    this.onLog(
      "ACTION",
      `Setting intent ${step.intentIndex} to ${step.daysAgo} days old...`
    );

    try {
      // Get all intents
      const response = await chrome.runtime.sendMessage({
        type: "GET_ALL_INTENTS",
      });

      const intents = response.intents || [];
      if (intents[step.intentIndex]) {
        const intent = intents[step.intentIndex];
        const daysInMs = step.daysAgo * 24 * 60 * 60 * 1000;

        // Update timestamps
        intent.lastUpdated = Date.now() - daysInMs;
        intent.firstSeen = intent.firstSeen - daysInMs;

        // Save updated intent
        await chrome.runtime.sendMessage({
          type: "UPDATE_INTENT",
          intent,
        });

        this.onLog("SUCCESS", `Intent aged to ${step.daysAgo} days ago`);
      } else {
        this.onLog("WARN", `Intent ${step.intentIndex} not found`);
      }
    } catch (error) {
      this.onLog("ERROR", `Failed to age intent: ${error}`);
    }
  }

  private async handleTriggerNudges(): Promise<void> {
    this.onLog("ACTION", "Triggering nudge generation...");

    try {
      await chrome.runtime.sendMessage({
        type: "GENERATE_NUDGES",
      });

      this.onLog("SUCCESS", "Nudge generation triggered");
      this.onLog("INFO", "Check main view for new nudges");
    } catch (error) {
      this.onLog("ERROR", `Nudge generation failed: ${error}`);
    }
  }

  private async waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      // Timeout after 30 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 30000);
    });
  }

  private async simulateInteractions(
    tabId: number,
    simulate: NonNullable<TestStep["simulate"]>
  ): Promise<void> {
    try {
      // Inject simulation script
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (simConfig) => {
          // This runs in the page context
          const config = simConfig as any;

          // Wait for content to be ready
          const waitForContent = () => {
            return new Promise((resolve) => {
              if (document.readyState === "complete") {
                setTimeout(resolve, 500); // Extra delay for dynamic content
              } else {
                window.addEventListener("load", () => {
                  setTimeout(resolve, 500);
                });
              }
            });
          };

          waitForContent().then(() => {
            // Simulate scrolling
            if (config.scroll) {
              const maxScroll =
                document.documentElement.scrollHeight - window.innerHeight;
              const targetScroll = (config.scroll.to / 100) * maxScroll;
              const speed =
                config.scroll.speed === "slow"
                  ? 30
                  : config.scroll.speed === "fast"
                  ? 150
                  : 80;

              let currentScroll = 0;
              const scrollInterval = setInterval(() => {
                if (currentScroll >= targetScroll) {
                  clearInterval(scrollInterval);
                  console.log(`[Bryn Test] Scrolled to ${config.scroll.to}%`);
                  return;
                }
                currentScroll += speed;
                window.scrollTo({
                  top: Math.min(currentScroll, targetScroll),
                  behavior: "smooth",
                });
              }, 50);
            }

            // Simulate text selection (after scroll starts)
            if (config.selectText && config.selectText.length > 0) {
              setTimeout(() => {
                config.selectText.forEach((sel: any, idx: number) => {
                  setTimeout(() => {
                    const elements = document.querySelectorAll(sel.selector);
                    const element = elements[sel.index];
                    if (element) {
                      const range = document.createRange();
                      range.selectNodeContents(element);
                      const selection = window.getSelection();
                      selection?.removeAllRanges();
                      selection?.addRange(range);

                      console.log(
                        `[Bryn Test] Selected text from ${sel.selector}[${sel.index}]`
                      );

                      // Trigger mouseup event (what page-tracker listens for)
                      document.dispatchEvent(
                        new MouseEvent("mouseup", { bubbles: true })
                      );

                      // Clear selection after 2 seconds
                      setTimeout(() => {
                        selection?.removeAllRanges();
                        console.log(`[Bryn Test] Cleared selection`);
                      }, 2000);
                    } else {
                      console.warn(
                        `[Bryn Test] Element not found: ${sel.selector}[${sel.index}]`
                      );
                    }
                  }, idx * 3000);
                });
              }, 2000);
            }
          });
        },
        args: [simulate],
      });

      this.onLog("INFO", "Simulated interactions: scroll, text selection");
    } catch (error) {
      this.onLog("WARN", `Could not simulate interactions: ${error}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  pause(): void {
    this.isPaused = true;
    this.onLog("INFO", "Test execution paused");
  }

  resume(): void {
    this.isPaused = false;
    this.onLog("INFO", "Test execution resumed");
  }

  stop(): void {
    this.isRunning = false;
    this.onLog("INFO", "Test execution stopped");
    this.handleCloseAll();
  }

  getStatus(): { isRunning: boolean; isPaused: boolean } {
    return { isRunning: this.isRunning, isPaused: this.isPaused };
  }
}
