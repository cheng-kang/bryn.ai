import { useEffect, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "../components/app-header";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { PageData } from "@/types/page";
import type { Intent } from "@/types/intent";
import type { QueuedTask } from "@/core/processing-queue";
import { useRealtimeUpdates } from "../hooks/use-realtime-updates";
import { useRealtimePageUpdates } from "../hooks/use-realtime-page-updates";

interface AllPagesViewProps {
  onBack: () => void;
  onPageClick: (pageId: string) => void;
}

interface PageGroup {
  label: string;
  pages: PageData[];
}

export function AllPagesView({ onBack, onPageClick }: AllPagesViewProps) {
  const [pages, setPages] = useState<PageData[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [tasks, setTasks] = useState<QueuedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const [pagesRes, intentsRes, queueRes] = await Promise.all([
        chrome.runtime.sendMessage({ type: "GET_ALL_PAGES" }),
        chrome.runtime.sendMessage({ type: "GET_ALL_INTENTS" }),
        chrome.runtime.sendMessage({ type: "GET_QUEUE_STATUS" }),
      ]);

      if (pagesRes.pages) {
        const sorted = pagesRes.pages.sort(
          (a: PageData, b: PageData) => b.timestamp - a.timestamp
        );
        setPages(sorted);
      }

      if (intentsRes.intents) {
        setIntents(intentsRes.intents);
      }

      if (queueRes.queueTasks) {
        setTasks(queueRes.queueTasks);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time updates - refresh on page/intent/task changes
  useRealtimePageUpdates(loadData);
  useRealtimeUpdates(loadData);

  const toggleExpanded = (pageId: string) => {
    const newSet = new Set(expandedPages);
    if (newSet.has(pageId)) {
      newSet.delete(pageId);
    } else {
      newSet.add(pageId);
    }
    setExpandedPages(newSet);
  };

  const getIntentForPage = (page: PageData) => {
    const intentId = page.intentAssignments.primary?.intentId;
    if (!intentId) return null;
    return intents.find((i) => i.id === intentId);
  };

  const getTasksForPage = (pageId: string) => {
    return tasks
      .filter((t) => t.pageId === pageId)
      .sort((a, b) => b.createdAt - a.createdAt);
  };

  const getTaskIcon = (status: QueuedTask["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case "processing":
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case "failed":
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  const getTaskTypeName = (type: QueuedTask["type"]) => {
    switch (type) {
      case "semantic_extraction":
        return "Semantic Analysis";
      case "summarization":
        return "Summary";
      case "intent_matching":
        return "Intent Matching";
      case "generate_intent_label":
        return "Label";
      case "generate_intent_goal":
        return "Goal";
      case "generate_intent_summary":
        return "Summary";
      case "generate_intent_insights":
        return "Insights";
      case "generate_intent_next_steps":
        return "Next Steps";
      case "ai_verify_intent_matching":
        return "AI Verify";
      case "scan_intent_merge_opportunities":
        return "Scan Merges";
      case "merge_intents":
        return "Merge";
    }
  };

  const groupPagesByTime = (pages: PageData[]): PageGroup[] => {
    const now = Date.now();
    const groups: PageGroup[] = [];

    const today: PageData[] = [];
    const yesterday: PageData[] = [];
    const thisWeek: PageData[] = [];
    const older: PageData[] = [];

    pages.forEach((page) => {
      const age = now - page.timestamp;
      const hours = age / (1000 * 60 * 60);
      const days = age / (1000 * 60 * 60 * 24);

      if (hours < 24) {
        today.push(page);
      } else if (days < 2) {
        yesterday.push(page);
      } else if (days < 7) {
        thisWeek.push(page);
      } else {
        older.push(page);
      }
    });

    if (today.length > 0) groups.push({ label: "Today", pages: today });
    if (yesterday.length > 0)
      groups.push({ label: "Yesterday", pages: yesterday });
    if (thisWeek.length > 0)
      groups.push({ label: "This Week", pages: thisWeek });
    if (older.length > 0) groups.push({ label: "Older", pages: older });

    return groups;
  };

  const pageGroups = groupPagesByTime(pages);

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        showBackButton
        onBack={onBack}
        title="All Pages"
        subtitle={`${pages.length} pages tracked`}
      />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pages tracked yet. Start browsing!
            </p>
          ) : (
            pageGroups.map((group) => (
              <div key={group.label}>
                <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">
                  {group.label}
                </h3>
                <div className="space-y-2">
                  {group.pages.map((page) => {
                    const intent = getIntentForPage(page);
                    const isExpanded = expandedPages.has(page.id);

                    return (
                      <Card key={page.id} className="overflow-hidden">
                        <CardContent className="p-3">
                          {/* Header - Always Visible */}
                          <div
                            className="flex items-start justify-between gap-2 cursor-pointer"
                            onClick={() => toggleExpanded(page.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium truncate">
                                {page.title}
                              </h3>
                              <p className="text-xs text-muted-foreground mt-1">
                                {page.metadata.domain} ·{" "}
                                {new Date(page.timestamp).toLocaleString()}
                              </p>
                              {intent && (
                                <Badge
                                  variant="secondary"
                                  className="text-xs mt-1"
                                >
                                  {intent.label}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge variant="outline">
                                {Math.round(
                                  page.interactions.engagementScore * 100
                                )}
                                %
                              </Badge>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {/* Expanded Details */}
                          {isExpanded && (
                            <div className="mt-3 space-y-3 border-t pt-3">
                              {/* Metrics */}
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <div className="text-muted-foreground">
                                    Dwell Time
                                  </div>
                                  <div className="font-medium">
                                    {Math.round(
                                      page.interactions.dwellTime / 1000
                                    )}
                                    s
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Scroll Depth
                                  </div>
                                  <div className="font-medium">
                                    {page.interactions.scrollDepth}%
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Selections
                                  </div>
                                  <div className="font-medium">
                                    {page.interactions.textSelections.length}
                                  </div>
                                </div>
                              </div>

                              {/* Keywords/Concepts */}
                              {page.semanticFeatures && (
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">
                                    Keywords
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {page.semanticFeatures.concepts
                                      .slice(0, 10)
                                      .map((concept, idx) => (
                                        <Badge
                                          key={idx}
                                          variant="outline"
                                          className="text-xs"
                                        >
                                          {concept}
                                        </Badge>
                                      ))}
                                  </div>
                                </div>
                              )}

                              {/* Processing Tasks */}
                              {getTasksForPage(page.id).length > 0 && (
                                <div>
                                  <div className="text-xs text-muted-foreground mb-2">
                                    Processing History (
                                    {getTasksForPage(page.id).length} tasks)
                                  </div>
                                  <div className="space-y-1">
                                    {getTasksForPage(page.id).map((task) => (
                                      <div
                                        key={task.id}
                                        className="flex items-center gap-2 text-xs bg-muted/50 p-2 rounded"
                                      >
                                        {getTaskIcon(task.status)}
                                        <span className="flex-1">
                                          {getTaskTypeName(task.type)}
                                        </span>
                                        {task.durationMs && (
                                          <span className="text-muted-foreground font-mono">
                                            {task.durationMs}ms
                                          </span>
                                        )}
                                        {task.status === "failed" && (
                                          <span className="text-destructive text-xs">
                                            Failed
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex gap-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPageClick(page.id);
                                  }}
                                  className="text-xs text-primary hover:underline"
                                >
                                  View Details →
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    chrome.tabs.create({ url: page.url });
                                  }}
                                  className="text-xs text-primary hover:underline"
                                >
                                  Open Page →
                                </button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
