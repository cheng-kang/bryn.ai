import type { PageData } from "@/types/page";
import type { Intent } from "@/types/intent";

export async function generateActivitySummary(
  recentPages: PageData[],
  activeIntents: Intent[],
  timeRangeHours: number = 8
): Promise<string> {
  if (recentPages.length === 0) {
    return "No recent activity to show.";
  }

  try {
    // Lazy import aiPipeline to avoid loading it at module level in service worker
    const { aiPipeline } = await import("@/core/ai-pipeline");

    console.log("ActivitySummarizer: aiPipeline imported successfully");

    // Check if AI is available
    if (!aiPipeline.isAvailable()) {
      console.warn("AI not available for activity summary, using fallback");
      const topDomains = [
        ...new Set(recentPages.map((p) => p.metadata.domain)),
      ].slice(0, 3);
      return `Recently explored ${
        recentPages.length
      } pages across ${topDomains.join(", ")}.`;
    }

    console.log("ActivitySummarizer: Initializing AI pipeline");
    await aiPipeline.initialize();

    console.log("ActivitySummarizer: Getting session");
    // Get session (now public)
    const session = await aiPipeline.getSession();
    console.log("ActivitySummarizer: Session acquired");

    // Group pages by intent
    const intentSummaries = activeIntents
      .filter((i) =>
        recentPages.some((p) => p.intentAssignments.primary?.intentId === i.id)
      )
      .map((intent) => {
        const intentPages = recentPages.filter(
          (p) => p.intentAssignments.primary?.intentId === intent.id
        );
        return `"${intent.label}" (${intentPages.length} pages)`;
      })
      .join(", ");

    const topDomains = [
      ...new Set(recentPages.map((p) => p.metadata.domain)),
    ].slice(0, 3);

    const prompt = `Create a natural, conversational summary of the user's recent browsing activity.

TIME RANGE: Last ${timeRangeHours} hours
TOTAL PAGES: ${recentPages.length}
ACTIVE INTENTS: ${intentSummaries || "exploring various topics"}
TOP SITES: ${topDomains.join(", ")}

STYLE GUIDELINES:
- Use casual, friendly tone ("This morning you were...", "Looks like you've been...")
- Be specific but concise (1-2 sentences max)
- Focus on WHAT they were doing, not just WHERE
- Avoid robotic language

BAD: "You visited 5 pages on React documentation."
GOOD: "This morning you were diving into React Hooks documentation."

BAD: "Activity detected on YouTube and GitHub."
GOOD: "Looks like you've been watching coding tutorials and checking out some open source projects."

Generate a natural summary (1-2 sentences):`;

    const response = await session.prompt(prompt);
    // Clean up any markdown or extra formatting
    return response.replace(/```/g, "").trim();
  } catch (error) {
    console.error("Failed to generate activity summary:", error);
    // Fallback to simple summary
    const topDomains = [
      ...new Set(recentPages.map((p) => p.metadata.domain)),
    ].slice(0, 3);
    return `Recently explored ${recentPages.length} pages across ${topDomains.length} sites.`;
  }
}
