import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "../components/app-header";
import { LiveStatus } from "../components/live-status";
import { Download, Trash2 } from "lucide-react";

interface BackstageViewProps {
  onBack: () => void;
  onOpenIntentLibrary?: () => void;
  onOpenPages?: () => void;
  onOpenTaskQueue?: () => void;
}

interface StorageStats {
  totalPages: number;
  totalIntents: number;
  totalNudges: number;
  totalQueueTasks: number;
  totalBytes: number;
  totalMB: number;
}

interface UserSettings {
  aiIntensity: "low" | "medium" | "high";
  maxConcurrentAI: number;
  storageQuotaMB: number;
}

export function BackstageView({
  onBack,
  onOpenIntentLibrary,
  onOpenPages,
  onOpenTaskQueue,
}: BackstageViewProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [aiModelStatus, setAiModelStatus] = useState<any>(null);

  useEffect(() => {
    loadSettings();
    loadStorageStats();
    loadAIModelStatus();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_SETTINGS",
      });
      setSettings(response.settings);
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const loadStorageStats = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_STORAGE_STATS",
      });
      setStorageStats(response.stats);
    } catch (error) {
      console.error("Failed to load storage stats:", error);
    }
  };

  const loadAIModelStatus = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_AI_MODEL_STATUS",
      });
      setAiModelStatus(response.modelStatus);
    } catch (error) {
      console.error("Failed to load AI model status:", error);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "EXPORT_ALL_DATA",
      });
      const blob = new Blob([response.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bryn-ai-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export data:", error);
      alert("Failed to export data. Check console for details.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    setIsDeleting(true);
    try {
      await chrome.runtime.sendMessage({ type: "CLEAR_ALL_DATA" });
      alert("All data cleared successfully. The page will reload.");
      window.location.reload();
    } catch (error) {
      console.error("Failed to clear data:", error);
      alert("Failed to clear data. Check console for details.");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleAIIntensityChange = async (
    intensity: "low" | "medium" | "high"
  ) => {
    if (!settings) return;
    const maxConcurrent =
      intensity === "low" ? 1 : intensity === "medium" ? 2 : 3;
    const newSettings = {
      ...settings,
      aiIntensity: intensity,
      maxConcurrentAI: maxConcurrent,
    };
    setSettings(newSettings);
    await chrome.runtime.sendMessage({
      type: "UPDATE_SETTINGS",
      settings: newSettings,
    });
  };

  if (!settings || !storageStats) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Loading Bryn Backstage...
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        showBackButton
        onBack={onBack}
        title="Backstage"
        subtitle="Your single place to see what Bryn is maintaining"
      />

      <div className="flex-1 flex flex-col">
        <Tabs defaultValue="overview" className="flex-1 flex flex-col">
          <TabsList className="grid grid-cols-2 mx-4 my-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="data">Data &amp; AI</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-6">
                <section className="space-y-3">
                  <Card className="bg-muted/30 border border-dashed border-muted-foreground/30">
                    <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
                      <p className="text-sm font-semibold text-foreground">Keep a pulse on Bryn</p>
                      <p>Backstage shows what the assistant is maintaining and lets you jump into the organised workspaces.</p>
                    </CardContent>
                  </Card>
                </section>
                <LiveStatus
                  links={{
                    onQueue: onOpenTaskQueue,
                    onIntents: onOpenIntentLibrary,
                    onPages: onOpenPages,
                  }}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="data" className="flex-1">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-6">
                <section className="space-y-3">
                  <Card className="bg-muted/30 border border-dashed border-muted-foreground/30">
                    <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
                      <p className="text-sm font-semibold text-foreground">Manage your footprint</p>
                      <p>Use this tab to export, clean up, or tune the on-device AI so Bryn matches your comfort level.</p>
                    </CardContent>
                  </Card>
                </section>
                <section className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Data & Storage
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Review usage and manage what Bryn keeps locally.
                    </p>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Usage Overview</CardTitle>
                      <CardDescription>
                        See how much information Bryn is holding onto for you
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Total Size</p>
                          <p className="font-semibold">
                            {storageStats.totalMB?.toFixed(2) || "0.00"} MB
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Pages</p>
                          <p className="font-semibold">
                            {storageStats.totalPages || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Intents</p>
                          <p className="font-semibold">
                            {storageStats.totalIntents || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Suggestions</p>
                          <p className="font-semibold">
                            {storageStats.totalNudges || 0}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <button
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 border rounded hover:bg-muted transition-colors"
                          onClick={handleExport}
                          disabled={isExporting}
                        >
                          <Download className="h-4 w-4" />
                          {isExporting ? "Exporting..." : "Export All Data"}
                        </button>

                        <button
                          className={`w-full flex items-center justify-center gap-2 px-3 py-2 border rounded transition-colors ${
                            showDeleteConfirm
                              ? "bg-destructive text-destructive-foreground"
                              : "hover:bg-muted"
                          }`}
                          onClick={handleDelete}
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-4 w-4" />
                          {showDeleteConfirm
                            ? isDeleting
                              ? "Deleting..."
                              : "Click Again to Confirm"
                            : "Delete All Data"}
                        </button>

                        {showDeleteConfirm && !isDeleting && (
                          <p className="text-xs text-muted-foreground text-center">
                            This permanently removes your browsing data,
                            intents, and settings.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </section>

                <section className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      AI Behaviour
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Decide how hard Bryn’s on-device AI works for you.
                    </p>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">AI Configuration</CardTitle>
                      <CardDescription>
                        Tune how aggressively Bryn uses on-device AI
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => handleAIIntensityChange("low")}
                            className={`text-sm px-3 py-2 rounded border transition-colors ${
                              settings.aiIntensity === "low"
                                ? "bg-primary text-primary-foreground"
                                : "bg-background hover:bg-muted"
                            }`}
                          >
                            Low
                          </button>
                          <button
                            onClick={() => handleAIIntensityChange("medium")}
                            className={`text-sm px-3 py-2 rounded border transition-colors ${
                              settings.aiIntensity === "medium"
                                ? "bg-primary text-primary-foreground"
                                : "bg-background hover:bg-muted"
                            }`}
                          >
                            Medium
                          </button>
                          <button
                            onClick={() => handleAIIntensityChange("high")}
                            className={`text-sm px-3 py-2 rounded border transition-colors ${
                              settings.aiIntensity === "high"
                                ? "bg-primary text-primary-foreground"
                                : "bg-background hover:bg-muted"
                            }`}
                          >
                            High
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Current: {settings.maxConcurrentAI} concurrent AI {" "}
                          {settings.maxConcurrentAI === 1 ? "task" : "tasks"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </section>

                <section className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      About Bryn
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Check the status of Chrome’s on-device AI models.
                    </p>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        AI Model Availability
                      </CardTitle>
                      <CardDescription>
                        Bryn relies on these local models to generate insights
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {aiModelStatus ? (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Language Model
                            </span>
                            <span
                              className={
                                aiModelStatus.languageModel === "available"
                                  ? "text-green-600"
                                  : "text-orange-600"
                              }
                            >
                              {aiModelStatus.languageModel}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Summarizer
                            </span>
                            <span
                              className={
                                aiModelStatus.summarizer === "available"
                                  ? "text-green-600"
                                  : "text-orange-600"
                              }
                            >
                              {aiModelStatus.summarizer}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Language Detector
                            </span>
                            <span
                              className={
                                aiModelStatus.languageDetector === "available"
                                  ? "text-green-600"
                                  : "text-orange-600"
                              }
                            >
                              {aiModelStatus.languageDetector}
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Loading model status...
                        </p>
                      )}

                      <div className="text-xs text-muted-foreground">
                        <p>Bryn AI v1.0.0</p>
                        <p className="mt-1">Powered by Chrome's on-device Gemini Nano</p>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
