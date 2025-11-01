import type { Intent } from "@/types/intent";
import type { PageData } from "@/types/page";

export interface CompletionResult {
  completed: boolean;
  reason: string;
  confidence: number;
  evidence: string[];
}

export async function detectIntentCompletion(
  intent: Intent,
  latestPage: PageData
): Promise<CompletionResult> {
  // Check 1: Order confirmation pages
  const checkoutPatterns = [
    /thank\s*you\s*for\s*(your\s*)?order/i,
    /order\s*confirmation/i,
    /purchase\s*complete/i,
    /payment\s*successful/i,
    /order\s*complete/i,
    /transaction\s*successful/i,
  ];

  const isCheckout = checkoutPatterns.some(
    (p) => p.test(latestPage.title) || p.test(latestPage.content || "")
  );

  if (isCheckout) {
    return {
      completed: true,
      reason: "Order confirmation detected",
      confidence: 0.95,
      evidence: [
        `Page title: "${latestPage.title}"`,
        "Shopping journey completed",
      ],
    };
  }

  // Check 2: Form submission completion
  const isFormCompletion =
    latestPage.behavioralClass?.primaryBehavior === "form_filling" &&
    (latestPage.title.toLowerCase().includes("success") ||
      latestPage.title.toLowerCase().includes("submitted") ||
      latestPage.title.toLowerCase().includes("thank you") ||
      latestPage.title.toLowerCase().includes("confirmation"));

  if (isFormCompletion) {
    return {
      completed: true,
      reason: "Form submission completed",
      confidence: 0.85,
      evidence: ["Form behavior + success page detected"],
    };
  }

  // Check 3: Extended dormancy after high-engagement
  const daysSinceUpdate =
    (Date.now() - intent.lastUpdated) / (24 * 60 * 60 * 1000);
  const avgEngagement = intent.aggregatedSignals.patterns.avgEngagement;

  if (daysSinceUpdate > 14 && avgEngagement > 0.7) {
    return {
      completed: true,
      reason: "Extended dormancy after focused research",
      confidence: 0.7,
      evidence: [
        `No activity for ${Math.round(daysSinceUpdate)} days`,
        `High average engagement (${Math.round(avgEngagement * 100)}%)`,
        "Likely research goal achieved",
      ],
    };
  }

  // Check 4: Completion keywords in recent pages
  const completionKeywords = [
    "completed",
    "finished",
    "done",
    "purchased",
    "enrolled",
    "registered",
    "subscribed",
  ];

  const hasCompletionKeyword = completionKeywords.some((keyword) =>
    latestPage.title.toLowerCase().includes(keyword)
  );

  if (hasCompletionKeyword && intent.pageCount >= 5) {
    return {
      completed: true,
      reason: "Completion keyword detected after substantial research",
      confidence: 0.75,
      evidence: [
        `Page title contains completion signal: "${latestPage.title}"`,
        `Intent has ${intent.pageCount} pages, suggesting goal-oriented research`,
      ],
    };
  }

  return {
    completed: false,
    reason: "Intent still active",
    confidence: 1.0,
    evidence: [],
  };
}
