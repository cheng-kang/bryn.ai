import { Compass, LayoutDashboard, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SettingsActionsProps {
  onSettingsClick?: () => void;
  onDevToolsClick?: () => void;
}

export function SettingsActions({
  onSettingsClick,
  onDevToolsClick,
}: SettingsActionsProps) {
  return (
    <div className="border-t bg-background/80 backdrop-blur">
      <div className="px-4 py-3 space-y-3">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Compass className="h-4 w-4" />
          Step backstage when you want to see everything Bryn is working on.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="justify-start gap-2"
            onClick={() => onSettingsClick?.()}
          >
            <LayoutDashboard className="h-4 w-4" />
            Backstage
          </Button>
          <Button
            variant="ghost"
            className="justify-start gap-2"
            onClick={() => onDevToolsClick?.()}
          >
            <Code2 className="h-4 w-4" />
            Developer Hub
          </Button>
        </div>
      </div>
    </div>
  );
}
