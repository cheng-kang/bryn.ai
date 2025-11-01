// Global test state that persists across view navigation

interface TestState {
  isRunning: boolean;
  logs: Array<{ timestamp: string; level: string; message: string }>;
  currentScenario: string | null;
  isPaused: boolean;
}

class TestStateManager {
  private state: TestState = {
    isRunning: false,
    logs: [],
    currentScenario: null,
    isPaused: false,
  };

  private listeners: Set<() => void> = new Set();

  getState(): TestState {
    return { ...this.state };
  }

  setState(updates: Partial<TestState>) {
    this.state = { ...this.state, ...updates };
    this.notify();
  }

  addLog(timestamp: string, level: string, message: string) {
    this.state.logs.push({ timestamp, level, message });
    this.notify();
  }

  clearLogs() {
    this.state.logs = [];
    this.notify();
  }

  subscribe(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach((callback) => callback());
  }
}

export const testStateManager = new TestStateManager();
