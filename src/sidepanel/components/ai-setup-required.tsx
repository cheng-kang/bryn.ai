import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface AISetupRequiredProps {
  error: string;
  onRetry: () => void;
}

export function AISetupRequired({ error, onRetry }: AISetupRequiredProps) {
  return (
    <div className="h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <CardTitle>Chrome AI Setup Required</CardTitle>
          </div>
          <CardDescription className="mt-2">{error}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm">
            <p className="font-medium">To enable Bryn AI, please:</p>

            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>
                <strong>Check Chrome version:</strong>
                <ul className="ml-6 mt-1 space-y-1 list-disc list-inside">
                  <li>
                    Visit{" "}
                    <code className="px-1 py-0.5 bg-muted rounded">
                      chrome://version
                    </code>
                  </li>
                  <li>Ensure version 128 or higher</li>
                  <li>Update Chrome if needed</li>
                </ul>
              </li>

              <li className="mt-2">
                <strong>Check AI model status:</strong>
                <ul className="ml-6 mt-1 space-y-1 list-disc list-inside">
                  <li>
                    Visit{" "}
                    <code className="px-1 py-0.5 bg-muted rounded">
                      chrome://components
                    </code>
                  </li>
                  <li>Find "Optimization Guide On Device Model"</li>
                  <li>Status should be "Up-to-date"</li>
                  <li>If not, click "Check for update"</li>
                </ul>
              </li>

              <li className="mt-2">
                <strong>Check Chrome flags:</strong>
                <ul className="ml-6 mt-1 space-y-1 list-disc list-inside">
                  <li>
                    Visit{" "}
                    <code className="px-1 py-0.5 bg-muted rounded">
                      chrome://flags
                    </code>
                  </li>
                  <li>Search for "Gemini Nano" or "AI"</li>
                  <li>Ensure features are not disabled</li>
                </ul>
              </li>

              <li className="mt-2">
                <strong>Wait for model download:</strong>
                <ul className="ml-6 mt-1 space-y-1 list-disc list-inside">
                  <li>First time setup downloads ~1.7GB model</li>
                  <li>Check download status in chrome://components</li>
                  <li>May take several minutes depending on connection</li>
                </ul>
              </li>
            </ol>
          </div>

          <div className="pt-4 space-y-2">
            <Button onClick={onRetry} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Initialization
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              After completing setup, reload the extension
            </p>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> Bryn AI requires Chrome's built-in AI for
              100% private, on-device processing. No external APIs are used.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


