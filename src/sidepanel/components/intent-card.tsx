import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { Intent } from "@/types/intent";

interface IntentCardProps {
  intent: Intent;
  onClick?: () => void;
  pendingTasks?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function IntentCard({
  intent,
  onClick,
  pendingTasks,
  isExpanded = false,
  onToggleExpand,
}: IntentCardProps) {
  const statusColors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    emerging: "bg-blue-100 text-blue-700",
    dormant: "bg-yellow-100 text-yellow-700",
    completed: "bg-gray-100 text-gray-700",
    abandoned: "bg-red-100 text-red-700",
  };

  const statusColor =
    statusColors[intent.status] || "bg-gray-100 text-gray-700";

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else if (onToggleExpand) {
      onToggleExpand();
    }
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleExpand) {
      onToggleExpand();
    }
  };

  // Get top concepts for expanded view
  const topConcepts = Object.entries(intent.aggregatedSignals.keywords || {})
    .sort(([, a], [, b]) => b.avgEngagement - a.avgEngagement)
    .slice(0, 5);

  return (
    <Card
      className="cursor-pointer hover:bg-accent transition-colors"
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-medium">{intent.label}</h3>
              <Badge className={statusColor}>{intent.status}</Badge>
              {pendingTasks !== undefined && pendingTasks > 0 && (
                <Badge
                  variant="outline"
                  className="text-xs flex items-center gap-1"
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {pendingTasks} pending
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{intent.pageCount} pages</span>
              <span>•</span>
              <span>{new Date(intent.lastUpdated).toLocaleDateString()}</span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Confidence</span>
                <span className="font-medium">{intent.confidence}%</span>
              </div>
              <Progress value={intent.confidence} className="h-1" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onToggleExpand ? (
              isExpanded ? (
                <ChevronUp
                  className="h-4 w-4 text-muted-foreground"
                  onClick={handleExpandClick}
                />
              ) : (
                <ChevronDown
                  className="h-4 w-4 text-muted-foreground"
                  onClick={handleExpandClick}
                />
              )
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
            )}
          </div>
        </div>

        {/* Expanded View - Show More Details */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t space-y-2">
            {/* Top Concepts */}
            {topConcepts.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">
                  Top Concepts
                </div>
                <div className="space-y-1">
                  {topConcepts.map(([concept, stats]) => (
                    <div
                      key={concept}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate">{concept}</span>
                      <span className="text-muted-foreground ml-2">
                        {Math.round(stats.avgEngagement * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Domains */}
            {intent.aggregatedSignals.domains.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">
                  Domains
                </div>
                <div className="flex flex-wrap gap-1">
                  {intent.aggregatedSignals.domains.map((domain) => (
                    <Badge key={domain} variant="outline" className="text-xs">
                      {domain}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Created:</span>{" "}
                <span className="font-medium">
                  {new Date(intent.firstSeen).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Updated:</span>{" "}
                <span className="font-medium">
                  {new Date(intent.lastUpdated).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Goal */}
            {intent.goal && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">
                  Goal
                </div>
                <div className="text-xs">{intent.goal}</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
