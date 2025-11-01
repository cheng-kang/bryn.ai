import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export function AIModelStatus() {
  const [status, setStatus] = useState<{
    languageModel: string;
    summarizer: string;
    languageDetector: string;
  } | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_AI_MODEL_STATUS",
      });
      if (response.modelStatus) {
        setStatus(response.modelStatus);
      }
    } catch (error) {
      console.error("Failed to load AI model status:", error);
    }
  };

  if (!status) {
    return <div className="text-xs text-muted-foreground">Loading...</div>;
  }

  const getStatusBadge = (availability: string) => {
    if (availability === "available") {
      return <Badge className="bg-green-100 text-green-700">Available</Badge>;
    } else if (availability === "downloadable") {
      return <Badge className="bg-blue-100 text-blue-700">Downloadable</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-700">Unavailable</Badge>;
    }
  };

  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span>LanguageModel</span>
        {getStatusBadge(status.languageModel)}
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>Summarizer</span>
        {getStatusBadge(status.summarizer)}
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>LanguageDetector</span>
        {getStatusBadge(status.languageDetector)}
      </div>
    </>
  );
}
