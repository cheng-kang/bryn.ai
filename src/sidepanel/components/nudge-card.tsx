import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Info, Lightbulb } from "lucide-react";
import type { Nudge, SuggestedAction } from "@/types/nudge";

interface NudgeCardProps {
  nudge: Nudge;
  onFollow: (action: any) => void;
  onSnooze: () => void;
  onDismiss: () => void;
  intentLabel?: string;
}

export function NudgeCard({
  nudge,
  onFollow,
  onSnooze,
  onDismiss,
  intentLabel,
}: NudgeCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const primaryAction = useMemo<SuggestedAction | null>(() => {
    if (nudge.suggestedActions && nudge.suggestedActions.length > 0) {
      return nudge.suggestedActions[0];
    }
    return null;
  }, [nudge.suggestedActions]);

  const followPrimary = () => {
    if (primaryAction) {
      onFollow(primaryAction);
    } else {
      onFollow(null);
    }
  };

  const secondaryActions = useMemo(() => {
    if (!nudge.suggestedActions || nudge.suggestedActions.length <= 1) {
      return [];
    }
    return nudge.suggestedActions.slice(1);
  }, [nudge.suggestedActions]);

  const relativeTime = useMemo(() => {
    const createdAt = nudge.timing.createdAt;
    const now = Date.now();
    const diff = now - createdAt;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;

    const date = new Date(createdAt);
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  }, [nudge.timing.createdAt]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="uppercase tracking-wide">
            {nudge.type.replace("_", " ")}
          </Badge>
          {intentLabel && (
            <Badge variant="outline" className="text-xs">
              Intent • {intentLabel}
            </Badge>
          )}
          {nudge.priority === "high" && (
            <Badge variant="destructive" className="text-xs">
              Needs attention
            </Badge>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {relativeTime}
          </span>
        </div>
        <div>
          <CardTitle className="text-base flex items-start gap-2">
            <Lightbulb className="h-5 w-5 text-primary shrink-0" />
            <span>{nudge.message.title}</span>
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed mt-1">
            {nudge.message.body}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2">
          <Button className="justify-start" onClick={followPrimary}>
            {primaryAction?.label || "Sounds good — let's do it"}
          </Button>
          {secondaryActions.length > 0 && (
            <div className="space-y-2">
              {secondaryActions.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  className="w-full justify-start text-xs"
                  onClick={() => onFollow(action)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => setShowDetails((prev) => !prev)}
          >
            <Info className="h-3 w-3 mr-1" />
            {showDetails ? "Hide why" : "Explain this"}
          </Button>
          <Button variant="ghost" size="sm" className="px-2" onClick={onSnooze}>
            <Clock className="h-3 w-3 mr-1" />
            Snooze 1h
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={onDismiss}
          >
            Not relevant
          </Button>
        </div>

        {showDetails && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <p className="text-xs font-medium text-foreground/80">
              Why Bryn surfaced this
            </p>
            <p className="text-xs text-muted-foreground">
              {nudge.message.context?.reason}
            </p>
            {nudge.message.context?.evidence &&
              nudge.message.context.evidence.length > 0 && (
                <ul className="text-xs text-muted-foreground space-y-1">
                  {nudge.message.context.evidence.map((item, index) => (
                    <li key={index}>• {item}</li>
                  ))}
                </ul>
              )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
