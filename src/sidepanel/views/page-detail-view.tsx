import { useEffect, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AppHeader } from "../components/app-header";
import {
  ExternalLink,
  Clock,
  Target,
  FileText,
  Activity,
  Brain,
  Settings,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { PageData } from "@/types/page";
import type { Intent } from "@/types/intent";
import type { QueuedTask } from "@/core/processing-queue";
import { useRealtimePageUpdates } from "../hooks/use-realtime-page-updates";
import { useRealtimeUpdates } from "../hooks/use-realtime-updates";

interface PageDetailViewProps {
  pageId: string;
  onBack: () => void;
}

export function PageDetailView({ pageId, onBack }: PageDetailViewProps) {
  const [page, setPage] = useState<PageData | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [tasks, setTasks] = useState<QueuedTask[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPageData = useCallback(async () => {
    try {
      // Load page data
      const pageResponse = await chrome.runtime.sendMessage({
        type: "GET_ALL_PAGES",
      });

      if (pageResponse.pages) {
        const foundPage = pageResponse.pages.find(
          (p: PageData) => p.id === pageId
        );
        setPage(foundPage || null);

        // Load intent if page has one
        if (foundPage?.intentAssignments.primary?.intentId) {
          const intentResponse = await chrome.runtime.sendMessage({
            type: "GET_ALL_INTENTS",
          });
          const foundIntent = intentResponse.intents?.find(
            (i: Intent) =>
              i.id === foundPage.intentAssignments.primary?.intentId
          );
          setIntent(foundIntent || null);
        }
      }

      // Load tasks for this page
      const taskResponse = await chrome.runtime.sendMessage({
        type: "GET_QUEUE_STATUS",
      });
      if (taskResponse.queueTasks) {
        const pageTasks = taskResponse.queueTasks.filter(
          (t: QueuedTask) => t.pageId === pageId
        );
        setTasks(pageTasks);
      }
    } catch (error) {
      console.error("Failed to load page data:", error);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  // Real-time updates - refresh on page/intent/task changes
  useRealtimePageUpdates(loadPageData);
  useRealtimeUpdates(loadPageData);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading page details...</p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <AppHeader showBackButton onBack={onBack} title="Page Not Found" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Page not found</p>
        </div>
      </div>
    );
  }

  const getTaskIcon = (status: QueuedTask["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case "processing":
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case "failed":
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3 text-gray-500" />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        showBackButton
        onBack={onBack}
        title="Page Details"
        subtitle={page.metadata.domain}
      />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Page Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base mb-2">{page.title}</CardTitle>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 mb-3"
                  >
                    {page.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <Badge variant="outline" className="ml-2">
                  {Math.round(page.interactions.engagementScore * 100)}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Visited</div>
                  <div className="font-medium">
                    {new Date(page.timestamp).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">
                    Dwell Time
                  </div>
                  <div className="font-medium">
                    {Math.round(page.interactions.dwellTime / 1000)}s
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">
                    Scroll Depth
                  </div>
                  <div className="font-medium">
                    {page.interactions.scrollDepth}%
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">
                    Text Selections
                  </div>
                  <div className="font-medium">
                    {page.interactions.textSelections.length}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Intent Assignment */}
          {intent && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Intent Assignment</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <Badge variant="secondary" className="text-sm">
                      {intent.label}
                    </Badge>
                  </div>
                  {page.intentAssignments.primary && (
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Confidence
                        </div>
                        <div className="font-medium">
                          {Math.round(
                            page.intentAssignments.primary.confidence * 100
                          )}
                          %
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Auto-assigned
                        </div>
                        <div className="font-medium">
                          {page.intentAssignments.primary.autoAssigned
                            ? "Yes"
                            : "No"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Assigned
                        </div>
                        <div className="font-medium">
                          {new Date(
                            page.intentAssignments.primary.assignedAt
                          ).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Content & Analysis Section */}
          {(page.contentSummary || page.semanticFeatures) && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="text-sm font-semibold">Content & Analysis</h2>
              </div>

              {page.contentSummary && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      AI-Generated Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {page.contentSummary}
                    </p>
                  </CardContent>
                </Card>
              )}

              {page.semanticFeatures && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      Keywords & Concepts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {page.semanticFeatures.concepts.map((concept, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {concept}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <Separator />

          {/* Engagement & Activity Section */}
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold">Engagement & Activity</h2>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">
                    Engagement
                  </div>
                  <div className="text-2xl font-bold">
                    {Math.round(page.interactions.engagementScore * 100)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">
                    Dwell Time
                  </div>
                  <div className="text-2xl font-bold">
                    {Math.round(page.interactions.dwellTime / 1000)}s
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">
                    Scroll Depth
                  </div>
                  <div className="text-2xl font-bold">
                    {page.interactions.scrollDepth}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">
                    Scroll Distance
                  </div>
                  <div className="text-2xl font-bold">
                    {page.interactions.totalScrollDistance}px
                  </div>
                </div>
              </div>

              {page.interactions.textSelections.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <h4 className="text-sm font-semibold mb-3">
                      Text Selections ({page.interactions.textSelections.length}
                      )
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {page.interactions.textSelections.map(
                        (selection, idx) => (
                          <div
                            key={idx}
                            className="bg-muted p-2 rounded text-xs"
                          >
                            <p className="italic">"{selection.text}"</p>
                            <p className="text-muted-foreground mt-1">
                              {new Date(
                                selection.timestamp
                              ).toLocaleTimeString()}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </>
              )}

              {page.interactions.focusedSections &&
                page.interactions.focusedSections.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div>
                      <h4 className="text-sm font-semibold mb-3">
                        Focus Areas ({page.interactions.focusedSections.length})
                      </h4>
                      <div className="space-y-3">
                        {page.interactions.focusedSections.map(
                          (section, idx) => (
                            <div
                              key={idx}
                              className="p-3 bg-muted/50 rounded-lg"
                            >
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-sm font-medium">
                                  {section.heading}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(section.timeSpent / 1000)}s
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mb-2">
                                {section.textSelections} selections • Scroll
                                range: {section.scrollStart}%-
                                {section.scrollEnd}%
                              </div>
                              <div className="h-1.5 bg-primary/20 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      (section.timeSpent / 60000) * 100
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </>
                )}
            </CardContent>
          </Card>

          <Separator />

          {/* AI Analysis Section */}
          {page.semanticFeatures && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-5 w-5 text-primary" />
                <h2 className="text-sm font-semibold">AI Analysis</h2>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Intent Signals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Primary Action
                      </div>
                      <div className="font-medium capitalize">
                        {page.semanticFeatures.intentSignals.primaryAction}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Confidence
                      </div>
                      <div className="font-medium">
                        {Math.round(
                          page.semanticFeatures.intentSignals.confidence * 100
                        )}
                        %
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-xs text-muted-foreground mb-1">
                        Goal
                      </div>
                      <div className="font-medium">
                        {page.semanticFeatures.intentSignals.goal ||
                          "Not detected"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Sentiment
                      </div>
                      <div className="font-medium capitalize">
                        {page.semanticFeatures.sentiment}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Content Type
                      </div>
                      <div className="font-medium capitalize">
                        {page.semanticFeatures.contentType}
                      </div>
                    </div>
                  </div>

                  {page.semanticFeatures.intentSignals.evidence.length > 0 && (
                    <>
                      <Separator className="my-4" />
                      <div>
                        <h4 className="text-sm font-semibold mb-2">
                          Evidence & Reasoning
                        </h4>
                        <ul className="space-y-1">
                          {page.semanticFeatures.intentSignals.evidence.map(
                            (item, idx) => (
                              <li key={idx} className="text-xs flex gap-2">
                                <span className="text-muted-foreground">•</span>
                                <span>{item}</span>
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Extracted Entities</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-xs">
                    {Object.entries(page.semanticFeatures.entities).map(
                      ([type, items]) => (
                        <div key={type}>
                          <div className="text-muted-foreground capitalize mb-1">
                            {type}
                          </div>
                          {items.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {items.map((item, idx) => (
                                <Badge
                                  key={idx}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground">None</p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          <Separator />

          {/* Metadata Section */}
          <div className="flex items-center gap-2 mb-2">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold">Page Metadata</h2>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Description
                    </div>
                    <div className="text-xs">
                      {page.metadata.description || "None"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Keywords
                    </div>
                    <div className="text-xs">
                      {page.metadata.keywords || "None"}
                    </div>
                  </div>
                  {page.metadata.ogTitle && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        OG Title
                      </div>
                      <div className="text-xs">{page.metadata.ogTitle}</div>
                    </div>
                  )}
                  {page.metadata.ogDescription && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        OG Description
                      </div>
                      <div className="text-xs">
                        {page.metadata.ogDescription}
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-muted-foreground mb-1">Headings</div>
                    <div className="font-medium">
                      {page.metadata.headingCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Links</div>
                    <div className="font-medium">{page.metadata.linkCount}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">
                      Text Length
                    </div>
                    <div className="font-medium">
                      {page.metadata.bodyTextLength} chars
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Language</div>
                    <div className="font-medium">
                      {page.metadata.detectedLanguage ||
                        page.metadata.lang ||
                        "Unknown"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Navigation</div>
                    <div className="font-medium">
                      {page.metadata.hasNavigation ? "Yes" : "No"}
                    </div>
                  </div>
                  {page.metadata.canonical && (
                    <div className="col-span-2 md:col-span-3">
                      <div className="text-muted-foreground mb-1">
                        Canonical URL
                      </div>
                      <div className="font-medium break-all">
                        {page.metadata.canonical}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Processing History Section */}
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold">Processing History</h2>
            <Badge variant="outline" className="text-xs">
              {tasks.length} tasks
            </Badge>
          </div>

          {tasks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No processing tasks found for this page
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {tasks
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((task) => (
                  <Card key={task.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getTaskIcon(task.status)}
                          <span className="text-sm font-medium">
                            {task.type
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (l) => l.toUpperCase())}
                          </span>
                        </div>
                        <Badge
                          variant={
                            task.status === "completed" ? "default" : "outline"
                          }
                        >
                          {task.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium">Priority:</span> P
                          {task.priority}
                        </div>
                        <div>
                          <span className="font-medium">Duration:</span>{" "}
                          {task.durationMs || "N/A"}ms
                        </div>
                        <div>
                          <span className="font-medium">Created:</span>{" "}
                          {new Date(task.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                      {task.aiExecution && (
                        <div className="mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {task.aiExecution.api}
                          </Badge>
                          {task.aiExecution.parameters?.model && (
                            <span className="text-xs text-muted-foreground ml-2">
                              · {task.aiExecution.parameters.model}
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
