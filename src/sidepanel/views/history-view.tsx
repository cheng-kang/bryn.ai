import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppHeader } from "../components/app-header";
import { PageCard } from "../components/page-card";
import { Download } from "lucide-react";
import type { PageData } from "@/types/page";
import type { Intent } from "@/types/intent";

interface HistoryViewProps {
  onBack: () => void;
  onPageClick: (pageId: string) => void;
}

type ViewMode = "by-intent" | "by-domain" | "chronological";

export function HistoryView({ onBack, onPageClick }: HistoryViewProps) {
  const [pages, setPages] = useState<PageData[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("by-intent");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const PAGES_PER_LOAD = 50;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pagesResp, intentsResp] = await Promise.all([
        chrome.runtime.sendMessage({ type: "GET_ALL_PAGES" }),
        chrome.runtime.sendMessage({ type: "GET_ALL_INTENTS" }),
      ]);

      setPages(pagesResp.pages || []);
      setIntents(intentsResp.intents || []);
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter by search
  const filteredPages = pages.filter(
    (p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination
  const paginatedPages = filteredPages.slice(0, currentPage * PAGES_PER_LOAD);
  const hasMore = filteredPages.length > paginatedPages.length;

  const handleExport = () => {
    const data = JSON.stringify(
      {
        exportedAt: Date.now(),
        totalPages: filteredPages.length,
        searchQuery: searchQuery || null,
        pages: filteredPages.map((p) => ({
          title: p.title,
          url: p.url,
          timestamp: p.timestamp,
          domain: p.metadata.domain,
          intent: intents.find(
            (i) => i.id === p.intentAssignments.primary?.intentId
          )?.label,
        })),
      },
      null,
      2
    );

    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bryn-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderByIntent = () => {
    const grouped = new Map<string, PageData[]>();

    // Group by intent
    paginatedPages.forEach((page) => {
      const intentId = page.intentAssignments.primary?.intentId || "unassigned";
      if (!grouped.has(intentId)) {
        grouped.set(intentId, []);
      }
      grouped.get(intentId)!.push(page);
    });

    return Array.from(grouped.entries()).map(([intentId, intentPages]) => {
      const intent = intents.find((i) => i.id === intentId);
      const label = intent?.label || "Unassigned Pages";

      return (
        <div key={intentId} className="mb-6">
          <h3 className="text-sm font-semibold mb-2 sticky top-0 bg-background py-1 z-10">
            {label} ({intentPages.length} pages)
          </h3>
          <div className="space-y-2">
            {intentPages.map((page) => (
              <PageCard
                key={page.id}
                page={page}
                onClick={() => onPageClick(page.id)}
              />
            ))}
          </div>
        </div>
      );
    });
  };

  const renderByDomain = () => {
    const grouped = new Map<string, PageData[]>();

    paginatedPages.forEach((page) => {
      const domain = page.metadata.domain;
      if (!grouped.has(domain)) {
        grouped.set(domain, []);
      }
      grouped.get(domain)!.push(page);
    });

    // Sort by page count desc
    const sorted = Array.from(grouped.entries()).sort(
      (a, b) => b[1].length - a[1].length
    );

    return sorted.map(([domain, domainPages]) => (
      <div key={domain} className="mb-6">
        <h3 className="text-sm font-semibold mb-2 sticky top-0 bg-background py-1 z-10">
          {domain} ({domainPages.length} pages)
        </h3>
        <div className="space-y-2">
          {domainPages.map((page) => (
            <PageCard
              key={page.id}
              page={page}
              onClick={() => onPageClick(page.id)}
            />
          ))}
        </div>
      </div>
    ));
  };

  const renderChronological = () => {
    const sorted = [...paginatedPages].sort(
      (a, b) => b.timestamp - a.timestamp
    );

    // Group by date
    const byDate = new Map<string, PageData[]>();
    sorted.forEach((page) => {
      const date = new Date(page.timestamp).toLocaleDateString();
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date)!.push(page);
    });

    return Array.from(byDate.entries()).map(([date, datePages]) => (
      <div key={date} className="mb-6">
        <h3 className="text-sm font-semibold mb-2 sticky top-0 bg-background py-1 z-10">
          {date} ({datePages.length} pages)
        </h3>
        <div className="space-y-2">
          {datePages.map((page) => (
            <PageCard
              key={page.id}
              page={page}
              onClick={() => onPageClick(page.id)}
            />
          ))}
        </div>
      </div>
    ));
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        showBackButton
        onBack={onBack}
        title="History"
        subtitle={`${pages.length} total pages`}
      />

      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="flex gap-2">
          <Input
            placeholder="Search history..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filteredPages.length === 0}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>

        {/* View Mode Tabs */}
        <Tabs
          value={viewMode}
          onValueChange={(v) => setViewMode(v as ViewMode)}
        >
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="by-intent">By Intent</TabsTrigger>
            <TabsTrigger value="by-domain">By Domain</TabsTrigger>
            <TabsTrigger value="chronological">Timeline</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading history...</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 px-4">
          {viewMode === "by-intent" && renderByIntent()}
          {viewMode === "by-domain" && renderByDomain()}
          {viewMode === "chronological" && renderChronological()}

          {hasMore && (
            <Button
              variant="outline"
              className="w-full my-4"
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Load More ({filteredPages.length - paginatedPages.length}{" "}
              remaining)
            </Button>
          )}

          {paginatedPages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No pages found
            </p>
          )}
        </ScrollArea>
      )}
    </div>
  );
}
