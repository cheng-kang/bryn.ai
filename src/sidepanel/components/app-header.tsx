import { ChevronLeft } from "lucide-react";
import { ProcessingStatus } from "./processing-status";

interface AppHeaderProps {
  showBackButton?: boolean;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  showProcessingStatus?: boolean;
  onViewQueue?: () => void;
}

export function AppHeader({
  showBackButton = false,
  onBack,
  title,
  subtitle,
  showProcessingStatus = false,
  onViewQueue,
}: AppHeaderProps) {
  return (
    <header className="p-4 border-b bg-background sticky top-0 z-10">
      {showBackButton && onBack && (
        <button
          onClick={onBack}
          className="text-sm text-primary hover:underline mb-2 flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Main View
        </button>
      )}
      <div className="flex items-center gap-2">
        <img
          src="/icons/@icon320.png"
          alt="Bryn AI"
          className="h-6 w-6 rounded"
        />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{title || "Bryn AI"}</h1>
          <p className="text-xs text-muted-foreground">
            {subtitle ||
              "Just keep doing your thing — I'll take care of the rest."}
          </p>
          {showProcessingStatus && (
            <ProcessingStatus onViewQueue={onViewQueue} />
          )}
        </div>
      </div>
    </header>
  );
}
