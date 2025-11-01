import { AppHeader } from "../components/app-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LiveStatus, StatusLink } from "../components/live-status";
import { FlaskConical } from "lucide-react";

interface DeveloperHubViewProps {
  onBack: () => void;
  onOpenTaskQueue?: () => void;
  onOpenTestRunner?: () => void;
  onOpenIntents?: () => void;
  onOpenPages?: () => void;
}

export function DeveloperHubView({
  onBack,
  onOpenTaskQueue,
  onOpenTestRunner,
  onOpenIntents,
  onOpenPages,
}: DeveloperHubViewProps) {
  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        showBackButton
        onBack={onBack}
        title="Developer Hub"
        subtitle="Tools for debugging, diagnostics, and validating Bryn"
      />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-8">
          <section className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Automation & Testing
              </p>
              <p className="text-sm text-muted-foreground">
                Run showcase flows or reproduce issues in the Scenario Runner.
              </p>
            </div>

            <StatusLink
              label="Scenario Runner"
              value="Trigger curated scenarios and monitor execution."
              icon={<FlaskConical className="h-4 w-4" />}
              onClick={onOpenTestRunner}
              disabled={!onOpenTestRunner}
              withBorder
              emphasis="muted"
            />
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Developer Live Status
              </p>
              <p className="text-sm text-muted-foreground">
                Queue metrics, resource usage, and quick access to debugging
                tools.
              </p>
            </div>

            <LiveStatus
              variant="diagnostics"
              links={{
                onQueue: onOpenTaskQueue,
                onIntents: onOpenIntents,
                onPages: onOpenPages,
              }}
            />
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
