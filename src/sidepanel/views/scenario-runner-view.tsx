import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "../components/app-header";
import { LiveStatus } from "../components/live-status";
import { Play, Square, RotateCcw, Copy, Check, Trash2, Loader2, AlertTriangle } from "lucide-react";
import {
  TEST_SCENARIOS,
  type TestScenario as ScenarioType,
} from "../utils/test-scenarios";
import { TestExecutor } from "../utils/test-executor";
import { testStateManager } from "../context/test-state";

interface ScenarioRunnerViewProps {
  onBack: () => void;
  onOpenTaskQueue?: () => void;
  onOpenIntents?: () => void;
  onOpenPages?: () => void;
}

type LogLevel =
  | "INFO"
  | "ACTION"
  | "DETECT"
  | "WARN"
  | "ERROR"
  | "SUCCESS"
  | "NUDGE";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

interface TestScenarioUI extends ScenarioType {
  selected: boolean;
  status: "idle" | "running" | "success" | "warning" | "error";
}

export function ScenarioRunnerView({
  onBack,
  onOpenTaskQueue,
  onOpenIntents,
  onOpenPages,
}: ScenarioRunnerViewProps) {
  const [activeTab, setActiveTab] = useState<"scenarios" | "execution">(
    "scenarios"
  );
  const [isRunning, setIsRunning] = useState(
    testStateManager.getState().isRunning
  );
  const [logs, setLogs] = useState<LogEntry[]>(
    testStateManager.getState().logs.map((log) => ({
      timestamp: log.timestamp,
      level: log.level as LogLevel,
      message: log.message,
    }))
  );
  const [copied, setCopied] = useState(false);
  const [scenarios, setScenarios] = useState<TestScenarioUI[]>(
    TEST_SCENARIOS.map((scenario, index) => ({
      ...scenario,
      selected: index === 0,
      status: "idle" as const,
    }))
  );

  const testExecutorRef = useRef<TestExecutor | null>(null);
  const logAreaRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  useEffect(() => {
    if (logAreaRef.current && !userScrolledUp) {
      logAreaRef.current.scrollTop = logAreaRef.current.scrollHeight;
    }
  }, [logs, userScrolledUp]);

  const handleLogScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const isAtBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 50;
    setUserScrolledUp(!isAtBottom);
  };

  useEffect(() => {
    if (!testExecutorRef.current) {
      testExecutorRef.current = new TestExecutor((level, message) => {
        addLog(level as LogLevel, message);
      });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = testStateManager.subscribe(() => {
      const state = testStateManager.getState();
      setLogs(
        state.logs.map((log) => ({
          timestamp: log.timestamp,
          level: log.level as LogLevel,
          message: log.message,
        }))
      );
      setIsRunning(state.isRunning);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const switchToExecution = () => setActiveTab("execution");

  const addLog = (level: LogLevel, message: string) => {
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
    testStateManager.addLog(timestamp, level, message);
    setLogs((previous) => [...previous, { timestamp, level, message }]);
  };

  const handleStop = () => {
    if (testExecutorRef.current) {
      testExecutorRef.current.stop();
    }
    setIsRunning(false);
    addLog("INFO", "Scenario runner stopped");
    testStateManager.setState({ isRunning: false, currentScenario: null });
  };

  const handleReset = async () => {
    addLog("WARN", "Resetting Bryn to a fresh state...");
    try {
      await chrome.runtime.sendMessage({ type: "CLEAR_ALL_DATA" });
      testStateManager.clearLogs();
      setLogs([]);
      setIsRunning(false);
      setScenarios((previous) =>
        previous.map((scenario, index) => ({
          ...scenario,
          selected: index === 0,
          status: "idle",
        }))
      );
      addLog("SUCCESS", "Reset complete – Bryn is ready to run again");
      switchToExecution();
    } catch (error) {
      addLog("ERROR", `Failed to reset: ${error}`);
    }
  };

  const handleClearLogs = () => {
    testStateManager.clearLogs();
    setLogs([]);
  };

  const handleCopyLogs = async () => {
    const text = logs
      .map((log) => `[${log.timestamp}] ${log.level}: ${log.message}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy logs:", error);
    }
  };

  const handleRunScenario = async (scenarioId: string) => {
    const scenario = scenarios.find((item) => item.id === scenarioId);
    if (!scenario || !testExecutorRef.current) return;

    switchToExecution();
    addLog("INFO", `━━━ Starting scenario: ${scenario.name} ━━━`);
    setScenarios((previous) =>
      previous.map((item) =>
        item.id === scenarioId ? { ...item, status: "running" as const } : item
      )
    );

    try {
      await testExecutorRef.current.executeScenario(scenario.steps);
      addLog("SUCCESS", `Scenario '${scenario.name}' completed`);
      setScenarios((previous) =>
        previous.map((item) =>
          item.id === scenarioId
            ? { ...item, status: "success" as const }
            : item
        )
      );

      if (scenario.manualChecks && scenario.manualChecks.length > 0) {
        addLog("INFO", "Manual verification suggested:");
        scenario.manualChecks.forEach((check, index) => {
          addLog("INFO", `  ${index + 1}. ${check}`);
        });
      }
    } catch (error) {
      addLog("ERROR", `Scenario failed: ${error}`);
      setScenarios((previous) =>
        previous.map((item) =>
          item.id === scenarioId ? { ...item, status: "error" as const } : item
        )
      );
    }
  };

  const toggleScenario = (id: string) => {
    setScenarios((previous) =>
      previous.map((scenario) =>
        scenario.id === id
          ? { ...scenario, selected: !scenario.selected }
          : scenario
      )
    );
  };

  const getLogColor = (level: LogLevel): string => {
    const colors: Record<LogLevel, string> = {
      INFO: "text-blue-600",
      ACTION: "text-foreground",
      DETECT: "text-purple-600",
      WARN: "text-orange-600",
      ERROR: "text-red-600",
      SUCCESS: "text-green-600",
      NUDGE: "text-yellow-600",
    };
    return colors[level] || "text-foreground";
  };

  const getScenarioButtonConfig = (scenario: TestScenarioUI, isRunning: boolean) => {
    if (scenario.status === "running") {
      return {
        label: "Running...",
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
        className: "bg-primary text-primary-foreground border-transparent hover:bg-primary",
        disabled: true,
      };
    }
    if (isRunning && scenario.selected) {
      return {
        label: "In queue...",
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
        className: "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
        disabled: true,
      };
    }
    if (scenario.status === "success") {
      return {
        label: "Run again",
        icon: <Check className="h-4 w-4" />,
        className: "border-green-300 bg-green-50 text-green-700 hover:bg-green-100",
        disabled: false,
      };
    }
    if (scenario.status === "warning") {
      return {
        label: "Run again",
        icon: <AlertTriangle className="h-4 w-4" />,
        className: "border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
        disabled: false,
      };
    }
    if (scenario.status === "error") {
      return {
        label: "Retry",
        icon: <RotateCcw className="h-4 w-4" />,
        className: "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20",
        disabled: false,
      };
    }
    return {
      label: "Run scenario",
      icon: <Play className="h-4 w-4" />,
      className: "hover:bg-muted",
      disabled: false,
    };
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        showBackButton
        onBack={onBack}
        title="Scenario Runner"
        subtitle="Track automated checks and watch the logs live"
      />

      <div className="flex-1 flex flex-col">
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as "scenarios" | "execution")
          }
          className="flex-1 flex flex-col"
        >
          <TabsList className="grid grid-cols-2 mx-4 my-3">
            <TabsTrigger value="scenarios">Test Scenarios</TabsTrigger>
            <TabsTrigger value="execution">Execution</TabsTrigger>
          </TabsList>

          <TabsContent
            value="scenarios"
            className="flex-1 focus-visible:outline-none focus-visible:ring-0"
          >
            <ScrollArea className="h-full">
              <div className="p-4 space-y-6">
                <section className="space-y-3">
                  <Card className="border-dashed border-muted-foreground/30 bg-muted/30">
                    <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
                      <p className="text-sm font-semibold text-foreground">
                        How to use these scenarios
                      </p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Pick the scenarios you want Bryn to exercise.</li>
                        <li>
                          Use Run Selected to stream results in the Execution
                          tab.
                        </li>
                        <li>
                          Pause with Stop; use Reset when you need a clean data
                          slate.
                        </li>
                      </ol>
                    </CardContent>
                  </Card>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="flex-1 justify-center"
                      onClick={async () => {
                        if (!testExecutorRef.current || isRunning) return;
                        const selectedScenarios = scenarios.filter(
                          (scenario) => scenario.selected
                        );
                        if (selectedScenarios.length === 0) return;
                        setIsRunning(true);
                        testStateManager.setState({ isRunning: true });
                        switchToExecution();
                        addLog(
                          "INFO",
                          `Running ${selectedScenarios.length} selected scenario(s)...`
                        );
                        testStateManager.setState({
                          currentScenario: selectedScenarios[0].id,
                        });
                        for (const scenario of selectedScenarios) {
                          await handleRunScenario(scenario.id);
                        }
                        setIsRunning(false);
                        testStateManager.setState({
                          isRunning: false,
                          currentScenario: null,
                        });
                        addLog("SUCCESS", "Scenario suite completed");
                      }}
                      disabled={isRunning}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      {isRunning ? "Running..." : "Run Selected"}
                    </Button>
                    <Button
                      className="flex-1 justify-center"
                      onClick={handleStop}
                      variant="secondary"
                      disabled={!isRunning}
                    >
                      <Square className="h-4 w-4 mr-1" />
                      Stop
                    </Button>
                  </div>

                  <Button
                    onClick={handleReset}
                    variant="destructive"
                    className="w-full sm:w-auto flex items-center gap-2 px-4 py-2 text-sm font-semibold text-left whitespace-normal"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset & Clear Data
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Clears Bryn’s local cache so scenarios restart from a blank slate.
                  </p>
                </section>

                <section className="space-y-2">
                  {scenarios.map((scenario) => {
                    const buttonConfig = getScenarioButtonConfig(scenario, isRunning);
                    return (
                      <Card
                        key={scenario.id}
                        className={cn("cursor-pointer border bg-muted/20 transition-colors hover:bg-muted", scenario.selected && "border-primary/40")}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleScenario(scenario.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " " ) {
                            event.preventDefault();
                            toggleScenario(scenario.id);
                          }
                        }}
                      >
                        <CardContent className="p-4 space-y-4">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={scenario.selected}
                              onChange={() => toggleScenario(scenario.id)}
                              className="mt-1 rounded"
                              onClick={(event) => event.stopPropagation()}
                            />
                            <div>
                              <h3 className="text-sm font-semibold">{scenario.name}</h3>
                              <p className="text-xs text-muted-foreground break-words">{scenario.description}</p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            className={cn("w-full flex flex-col items-start gap-1 text-left disabled:opacity-100 disabled:pointer-events-none", buttonConfig.className)}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRunScenario(scenario.id);
                            }}
                            disabled={buttonConfig.disabled}
                          >
                            <span className="flex items-center gap-2 text-sm font-medium">
                              {buttonConfig.icon}
                              {buttonConfig.label}
                            </span>
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </section>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="execution"
            className="flex-1 focus-visible:outline-none focus-visible:ring-0"
          >
            <div className="flex flex-col h-full">
              <div className="px-4 pt-2 space-y-3">
                <LiveStatus
                  variant="diagnostics"
                  links={{
                    onQueue: onOpenTaskQueue,
                    onIntents: onOpenIntents,
                    onPages: onOpenPages,
                  }}
                />
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Execution Log</h2>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleClearLogs}
                      variant="ghost"
                      size="sm"
                      disabled={logs.length === 0}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                    <Button
                      onClick={handleCopyLogs}
                      variant="ghost"
                      size="sm"
                      disabled={logs.length === 0}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <div
                  ref={logAreaRef}
                  onScroll={handleLogScroll}
                  className="flex-1 bg-muted/50 font-mono text-xs px-4 py-3 overflow-y-auto"
                >
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground">
                      No logs yet. Start a scenario to stream events here.
                    </p>
                  ) : (
                    <div className="space-y-1 break-words">
                      {logs.map((log, index) => (
                        <div key={index} className="flex gap-2 min-w-0">
                          <span className="text-muted-foreground flex-shrink-0">
                            [{log.timestamp}]
                          </span>
                          <span
                            className={`${getLogColor(
                              log.level
                            )} flex-shrink-0`}
                          >
                            {log.level}:
                          </span>
                          <span className="break-words">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
