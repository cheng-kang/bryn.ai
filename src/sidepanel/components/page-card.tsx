import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import type { PageData } from "@/types/page";
import type { Intent } from "@/types/intent";

interface PageCardProps {
  page: PageData;
  intent?: Intent | null;
  taskCount?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onClick?: () => void;
  onIntentClick?: (intentId: string) => void;
}

export function PageCard({
  page,
  intent,
  taskCount = 0,
  isExpanded = false,
  onToggleExpand,
  onClick,
  onIntentClick,
}: PageCardProps) {
  const engagementPercent = Math.round(page.interactions.engagementScore * 100);

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else if (onToggleExpand) {
      onToggleExpand();
    }
  };

  const handleIntentBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onIntentClick && page.intentAssignments.primary?.intentId) {
      onIntentClick(page.intentAssignments.primary.intentId);
    }
  };

  return (
    <Card>
      <CardContent className="p-3">
        {/* Default View - Always Visible */}
        <div
          className="flex items-start justify-between gap-2 cursor-pointer"
          onClick={handleCardClick}
        >
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{page.title}</div>
              <div className="text-xs text-muted-foreground truncate">
                {page.metadata.domain} | {engagementPercent}% engagement
              </div>
              {page.intentAssignments.primary && intent && (
                <Badge
                  variant="outline"
                  className="text-xs mt-1 cursor-pointer hover:bg-accent"
                  onClick={handleIntentBadgeClick}
                >
                  {intent.label}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {taskCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {taskCount} tasks
              </Badge>
            )}
            {onToggleExpand &&
              (isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ))}
          </div>
        </div>

        {/* Expanded View - Show More Details */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="text-xs">
              <span className="text-muted-foreground">URL:</span>{" "}
              <span className="font-mono break-all">
                {page.url.length > 60
                  ? page.url.substring(0, 60) + "..."
                  : page.url}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Scroll depth:</span>{" "}
                <span className="font-medium">
                  {page.interactions.scrollDepth}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Dwell time:</span>{" "}
                <span className="font-medium">
                  {((page.interactions.dwellTime || 0) / 1000).toFixed(1)}s
                </span>
              </div>
            </div>

            {page.semanticFeatures?.concepts && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">
                  Top Concepts
                </div>
                <div className="flex flex-wrap gap-1">
                  {page.semanticFeatures.concepts.slice(0, 3).map((concept) => (
                    <Badge key={concept} variant="outline" className="text-xs">
                      {concept}
                    </Badge>
                  ))}
                  {page.semanticFeatures.concepts.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{page.semanticFeatures.concepts.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Processed:{" "}
              {new Date(page.processedAt || page.timestamp).toLocaleString()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
