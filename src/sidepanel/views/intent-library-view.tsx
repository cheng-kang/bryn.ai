import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppHeader } from "../components/app-header";
import { IntentCard } from "../components/intent-card";
import type { Intent } from "@/types/intent";

interface IntentLibraryViewProps {
  onBack: () => void;
  onIntentClick: (intent: Intent) => void;
}

type SortBy = "recent" | "pages" | "confidence";
type TabValue = "active" | "dormant" | "completed";

export function IntentLibraryView({
  onBack,
  onIntentClick,
}: IntentLibraryViewProps) {
  const [allIntents, setAllIntents] = useState<Intent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [selectedTab, setSelectedTab] = useState<TabValue>("active");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadIntents();
  }, []);

  const loadIntents = async () => {
    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_ALL_INTENTS",
      });
      setAllIntents(response.intents || []);
    } catch (error) {
      console.error("Failed to load intents:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter by tab
  const tabIntents = allIntents.filter((i) => {
    if (selectedTab === "active")
      return i.status === "active" || i.status === "emerging";
    if (selectedTab === "dormant") return i.status === "dormant";
    if (selectedTab === "completed")
      return i.status === "completed" || i.status === "merged";
    return false;
  });

  // Filter by search
  const searchedIntents = tabIntents.filter(
    (i) =>
      i.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      Object.keys(i.aggregatedSignals.keywords).some((k) =>
        k.toLowerCase().includes(searchQuery.toLowerCase())
      ) ||
      i.aggregatedSignals.domains.some((d) =>
        d.includes(searchQuery.toLowerCase())
      )
  );

  // Sort
  const sortedIntents = [...searchedIntents].sort((a, b) => {
    if (sortBy === "recent") return b.lastUpdated - a.lastUpdated;
    if (sortBy === "pages") return b.pageCount - a.pageCount;
    if (sortBy === "confidence") return b.confidence - a.confidence;
    return 0;
  });

  const getTabCount = (tab: TabValue) => {
    if (tab === "active")
      return allIntents.filter(
        (i) => i.status === "active" || i.status === "emerging"
      ).length;
    if (tab === "dormant")
      return allIntents.filter((i) => i.status === "dormant").length;
    if (tab === "completed")
      return allIntents.filter(
        (i) => i.status === "completed" || i.status === "merged"
      ).length;
    return 0;
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        showBackButton
        onBack={onBack}
        title="Intent Library"
        subtitle={`${allIntents.length} total intents`}
      />

      <div className="p-4 space-y-4">
        {/* Search and Sort */}
        <div className="flex gap-2">
          <Input
            placeholder="Search intents..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            className="flex-1"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="border rounded px-3 py-1 text-sm bg-background"
          >
            <option value="recent">Recent</option>
            <option value="pages">Page Count</option>
            <option value="confidence">Confidence</option>
          </select>
        </div>

        {/* Tabs */}
        <Tabs
          value={selectedTab}
          onValueChange={(v) => setSelectedTab(v as TabValue)}
        >
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="active">
              Active ({getTabCount("active")})
            </TabsTrigger>
            <TabsTrigger value="dormant">
              Dormant ({getTabCount("dormant")})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({getTabCount("completed")})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedTab} className="mt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Loading intents...
              </p>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-2 pr-4">
                  {sortedIntents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {searchQuery
                        ? "No intents match your search"
                        : `No ${selectedTab} intents`}
                    </p>
                  ) : (
                    sortedIntents.map((intent) => (
                      <IntentCard
                        key={intent.id}
                        intent={intent}
                        onClick={() => onIntentClick(intent)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
