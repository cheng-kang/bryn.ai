import type { Intent } from "@/types/intent";
import type { Nudge, SuggestedAction } from "@/types/nudge";
import { storage } from "@/core/storage-manager";
import { aiPipeline } from "@/core/ai-pipeline";

function cleanAIJSON(response: string): string {
  const trimmed = response.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  const match = withoutFence.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return match ? match[0] : withoutFence;
}

class NudgeGenerator {
  private readonly MAX_NUDGES_PER_DAY = 3;

  async generateNudges(): Promise<Nudge[]> {
    const intents = await storage.getAllIntents();
    let existingNudges = await storage.getPendingNudges();

    await this.refreshExistingNudges(intents, existingNudges);

    existingNudges = await storage.getPendingNudges();

    // Don't generate if already at limit
    if (existingNudges.length >= this.MAX_NUDGES_PER_DAY) {
      return [];
    }

    const newNudges: Nudge[] = [];
    const existingKeys = new Set(
      existingNudges.map((nudge) =>
        this.buildNudgeKey(nudge.intentId, nudge.type)
      )
    );
    const newKeys = new Set<string>();

    for (const intent of intents) {
      // Skip discarded intents
      if (intent.userFeedback.discarded) continue;

      // Check each rule
      const dormantNudge = await this.checkDormantIntent(intent);
      if (dormantNudge) {
        const key = this.buildNudgeKey(
          dormantNudge.intentId,
          dormantNudge.type
        );
        if (!existingKeys.has(key) && !newKeys.has(key)) {
          newNudges.push(dormantNudge);
          newKeys.add(key);
        }
      }

      const mergeNudge = await this.checkMergeSuggestion(intent);
      if (mergeNudge) {
        const key = this.buildNudgeKey(mergeNudge.intentId, mergeNudge.type);
        if (!existingKeys.has(key) && !newKeys.has(key)) {
          newNudges.push(mergeNudge);
          newKeys.add(key);
        }
      }

      // NEW: Knowledge gap check (only for active intents with 3+ pages)
      if (intent.status === "active" && intent.pageCount >= 3) {
        const gapNudge = await this.checkKnowledgeGaps(intent);
        if (gapNudge) {
          const key = this.buildNudgeKey(gapNudge.intentId, gapNudge.type);
          if (!existingKeys.has(key) && !newKeys.has(key)) {
            newNudges.push(gapNudge);
            newKeys.add(key);
          }
        }
      }

      // NEW: Milestone prediction (only for active intents with 5+ pages)
      if (intent.status === "active" && intent.pageCount >= 5) {
        const milestoneNudge = await this.checkMilestone(intent);
        if (milestoneNudge) {
          const key = this.buildNudgeKey(
            milestoneNudge.intentId,
            milestoneNudge.type
          );
          if (!existingKeys.has(key) && !newKeys.has(key)) {
            newNudges.push(milestoneNudge);
            newKeys.add(key);
          }
        }
      }
    }

    // Sort by priority and limit
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    newNudges.sort(
      (a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]
    );

    const toSave = newNudges.slice(
      0,
      this.MAX_NUDGES_PER_DAY - existingNudges.length
    );

    for (const nudge of toSave) {
      await storage.saveNudge(nudge);
    }

    return toSave;
  }

  private async checkDormantIntent(intent: Intent): Promise<Nudge | null> {
    const daysSinceUpdate =
      (Date.now() - intent.lastUpdated) / (24 * 60 * 60 * 1000);

    if (daysSinceUpdate < 7 || intent.status === "completed") {
      return null;
    }

    const pages = await storage.getPagesByIntent(intent.id);
    const topPages = pages
      .sort(
        (a, b) =>
          b.interactions.engagementScore - a.interactions.engagementScore
      )
      .slice(0, 3);

    const evidence = [
      `Last activity ${Math.floor(daysSinceUpdate)} days ago`,
      `${pages.length} pages explored`,
      `High engagement on: ${topPages[0]?.title || "various pages"}`,
    ];

    const nudge: Nudge = {
      id: `nudge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      intentId: intent.id,
      type: "reminder",
      priority: daysSinceUpdate > 14 ? "high" : "medium",
      status: "pending",
      message: {
        title: `Remember your ${intent.label}?`,
        body: `It's been ${Math.floor(
          daysSinceUpdate
        )} days since you last explored this topic. You had ${
          pages.length
        } pages and seemed engaged. Ready to continue?`,
        context: {
          reason: `No activity for ${Math.floor(daysSinceUpdate)} days`,
          evidence,
          confidence: 0.8,
        },
      },
      suggestedActions: [
        {
          label: `Continue researching ${intent.label}`,
          action: "search",
          payload: { query: intent.label },
          confidence: 0.9,
          reasoning: "Resume where you left off",
        },
      ],
      timing: {
        createdAt: Date.now(),
        triggerRule: "dormant_intent",
      },
    };

    return this.enhanceNudgeWithAI(intent, nudge, {
      kind: "reminder",
      daysInactive: Math.floor(daysSinceUpdate),
      pageCount: pages.length,
      samplePages: topPages.map((page) => page.title),
    });
  }

  private async checkMergeSuggestion(intent: Intent): Promise<Nudge | null> {
    // Find potentially related intents based on keyword overlap
    const allIntents = await storage.getAllIntents();
    const candidates = allIntents.filter((other) => {
      if (other.id === intent.id) return false;
      if (other.status === "completed" || other.userFeedback.discarded)
        return false;

      // Check keyword similarity
      const intentKeywords = new Set(
        Object.keys(intent.aggregatedSignals.keywords)
      );
      const otherKeywords = new Set(
        Object.keys(other.aggregatedSignals.keywords)
      );
      const intersection = new Set(
        [...intentKeywords].filter((k) => otherKeywords.has(k))
      );

      return (
        intersection.size / Math.max(intentKeywords.size, otherKeywords.size) >
        0.3
      );
    });

    if (candidates.length === 0) return null;

    const relatedIntent = candidates[0];

    const nudge: Nudge = {
      id: `nudge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      intentId: intent.id,
      type: "merge_suggestion",
      priority: "low",
      status: "pending",
      message: {
        title: "Merge related research?",
        body: `"${intent.label}" and "${relatedIntent.label}" seem related. Would you like to merge them?`,
        context: {
          reason: "Similar topics detected",
          evidence: [
            `Both have similar keywords`,
            `${intent.pageCount} + ${relatedIntent.pageCount} pages total`,
          ],
          confidence: 0.7,
        },
      },
      suggestedActions: [
        {
          label: "Merge these intents",
          action: "merge_intents",
          payload: { fromId: intent.id, toId: relatedIntent.id },
          confidence: 0.7,
          reasoning: "Combining related research",
        },
      ],
      timing: {
        createdAt: Date.now(),
        triggerRule: "merge_suggestion",
      },
    };

    return this.enhanceNudgeWithAI(intent, nudge, {
      kind: "merge_suggestion",
      candidateIntent: {
        id: relatedIntent.id,
        label: relatedIntent.label,
        pageCount: relatedIntent.pageCount,
      },
      sharedKeywords: Array.from(
        new Set(
          Object.keys(intent.aggregatedSignals.keywords).filter((k) =>
            Object.keys(relatedIntent.aggregatedSignals.keywords).includes(k)
          )
        )
      ).slice(0, 6),
    });
  }

  private async checkKnowledgeGaps(intent: Intent): Promise<Nudge | null> {
    try {
      // Import knowledge graph
      const { knowledgeGraph } = await import("../core/knowledge-graph");
      await knowledgeGraph.initialize();

      // Get gaps for this intent's topic
      const gaps = knowledgeGraph.getKnowledgeGaps(intent.label);

      if (gaps.length === 0) return null;

      const topGap = gaps[0]; // Most relevant gap

      const nudge: Nudge = {
        id: `nudge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        intentId: intent.id,
        type: "knowledge_gap",
        priority: "medium",
        status: "pending",
        message: {
          title: `Expand your ${intent.label} knowledge`,
          body: `You've been researching ${intent.label}. Many people also explore ${topGap} as a natural next step. Interested?`,
          context: {
            reason: "Knowledge gap identified",
            evidence: [
              `You've covered the basics of ${intent.label}`,
              `${topGap} is a related advanced topic`,
              "This follows a common learning path",
            ],
            confidence: 0.75,
          },
        },
        suggestedActions: [
          {
            label: `Learn about ${topGap}`,
            action: "search",
            payload: { query: topGap },
            confidence: 0.8,
            reasoning: "Natural progression in learning journey",
          },
          {
            label: "Explore related topics",
            action: "explore_topic",
            payload: { baseIntent: intent.id, suggestedTopics: gaps },
            confidence: 0.7,
            reasoning: "Browse multiple related areas",
          },
        ],
        timing: {
          createdAt: Date.now(),
          triggerRule: "knowledge_gap_detection",
        },
      };

      return this.enhanceNudgeWithAI(intent, nudge, {
        kind: "knowledge_gap",
        topGap,
        relatedTopics: gaps,
      });
    } catch (error) {
      console.error("Failed to check knowledge gaps:", error);
      return null;
    }
  }

  private async checkMilestone(intent: Intent): Promise<Nudge | null> {
    try {
      const pages = await storage.getPagesByIntent(intent.id);

      await aiPipeline.initialize();

      const session = await aiPipeline.getSession();

      const prompt = `Analyze this research journey and predict the next logical milestone.

INTENT: ${intent.label}
PAGES VISITED: ${pages.length}
DOMAINS: ${intent.aggregatedSignals.domains.join(", ")}
TOP KEYWORDS: ${Object.keys(intent.aggregatedSignals.keywords)
        .slice(0, 10)
        .join(", ")}
BROWSING STYLE: ${intent.aggregatedSignals.patterns.browsingStyle}

COMMON RESEARCH PATTERNS:
- Shopping: Research → Compare → Decide → Purchase
- Learning: Overview → Tutorials → Practice → Advanced Topics
- Planning: Explore → Compare Options → Detail Planning → Execution

Based on the pages and patterns, what is the likely NEXT STEP in this journey?

Return ONLY valid JSON:
{
  "nextMilestone": "Compare product options",
  "confidence": 0.8,
  "reasoning": "User has researched features, next typically compares specific products",
  "suggestedAction": "Find comparison reviews or pricing"
}`;

      const response = await session.prompt(prompt);

      // Clean and parse response
      const cleaned = response
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      const result = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

      if (result.confidence < 0.6) return null;

      const nudge: Nudge = {
        id: `nudge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        intentId: intent.id,
        type: "milestone_next",
        priority: result.confidence > 0.8 ? "high" : "medium",
        status: "pending",
        message: {
          title: "Ready for the next step?",
          body: `Looks like you're ${result.nextMilestone.toLowerCase()}. ${
            result.suggestedAction
          }?`,
          context: {
            reason: "Milestone prediction",
            evidence: [result.reasoning],
            confidence: result.confidence,
          },
        },
        suggestedActions: [
          {
            label: result.suggestedAction,
            action: "search",
            payload: { query: `${intent.label} ${result.nextMilestone}` },
            confidence: result.confidence,
            reasoning: result.reasoning,
          },
        ],
        timing: {
          createdAt: Date.now(),
          triggerRule: "milestone_prediction",
        },
      };
      return this.enhanceNudgeWithAI(intent, nudge, {
        kind: "milestone_next",
        prediction: result,
        pageCount: pages.length,
        domains: intent.aggregatedSignals.domains,
      });
    } catch (error) {
      console.error("Failed to check milestone:", error);
      return null;
    }
  }

  private buildNudgeKey(intentId: string, type: Nudge["type"]): string {
    return `${intentId}:${type}`;
  }

  private async refreshExistingNudges(
    intents: Intent[],
    nudges: Nudge[]
  ): Promise<void> {
    if (nudges.length === 0) return;

    const intentMap = new Map(intents.map((intent) => [intent.id, intent]));
    const seenKeys = new Set<string>();

    for (const nudge of nudges) {
      const key = this.buildNudgeKey(nudge.intentId, nudge.type);

      if (seenKeys.has(key)) {
        await storage.deleteNudge(nudge.id);
        continue;
      }
      seenKeys.add(key);

      const intent = intentMap.get(nudge.intentId);
      if (!intent) continue;

      const titleContainsLabel = nudge.message.title.includes(intent.label);
      if (!titleContainsLabel) {
        const refreshed = await this.enhanceNudgeWithAI(intent, nudge, {
          kind: nudge.type,
          refresh: true,
          existingContext: nudge.message.context,
        });
        await storage.saveNudge(refreshed);
      }
    }
  }

  private async enhanceNudgeWithAI(
    intent: Intent,
    nudge: Nudge,
    context: Record<string, any>
  ): Promise<Nudge> {
    try {
      await aiPipeline.initialize();
    } catch (error) {
      console.warn("NudgeGenerator: AI initialization failed", error);
      return nudge;
    }

    if (!aiPipeline.isAvailable()) {
      return nudge;
    }

    try {
      const session = await aiPipeline.getSession({
        temperature: 0.5,
        topK: 2,
      });

      const actionsSummary = nudge.suggestedActions
        .map(
          (action) =>
            `${action.label} → ${action.action} (${JSON.stringify(
              action.payload
            ).slice(0, 80)})`
        )
        .join(" | ");

      const prompt = `Rewrite the following user nudge for clarity and personalization.

INTENT LABEL: ${intent.label}
INTENT STATUS: ${intent.status}
NUDGE TYPE: ${nudge.type}
CURRENT TITLE: ${nudge.message.title}
CURRENT BODY: ${nudge.message.body}
CONTEXT REASON: ${nudge.message.context.reason}
EVIDENCE: ${nudge.message.context.evidence.join("; ")}
SUGGESTED ACTIONS: ${actionsSummary || "(none)"}
ADDITIONAL CONTEXT: ${JSON.stringify(context).slice(0, 600)}

Return ONLY valid JSON:
{
  "title": "Concise title",
  "body": "Friendly body text",
  "reason": "Updated reason",
  "confidence": 0.8,
  "evidence": ["evidence item"],
  "actions": [
    {
      "label": "Action label",
      "action": "search",
      "payload": {"query": "example"},
      "confidence": 0.9,
      "reasoning": "Why this action helps"
    }
  ]
}`;

      const response = await session.prompt(prompt);
      const parsed = JSON.parse(cleanAIJSON(response));

      if (parsed.title) {
        nudge.message.title = parsed.title.trim();
      }
      if (parsed.body) {
        nudge.message.body = parsed.body.trim();
      }
      if (parsed.reason) {
        nudge.message.context.reason = parsed.reason;
      }
      if (Array.isArray(parsed.evidence) && parsed.evidence.length > 0) {
        nudge.message.context.evidence = parsed.evidence
          .map((item: string) => String(item))
          .slice(0, 4);
      }
      if (typeof parsed.confidence === "number") {
        nudge.message.context.confidence = Math.max(
          0.1,
          Math.min(parsed.confidence, 1)
        );
      }

      if (Array.isArray(parsed.actions) && parsed.actions.length > 0) {
        const validActions = new Set([
          "search",
          "open_url",
          "resume_session",
          "merge_intents",
          "explore_topic",
          "compare_options",
          "continue_reading",
        ]);

        const remapped = parsed.actions
          .map((action: any, index: number) => {
            const fallback =
              nudge.suggestedActions[index] || nudge.suggestedActions[0];
            const actionType =
              typeof action.action === "string" &&
              validActions.has(action.action)
                ? (action.action as SuggestedAction["action"])
                : fallback?.action;

            if (!actionType) return null;

            return {
              label: action.label || fallback?.label || "View suggestion",
              action: actionType,
              payload:
                action.payload !== undefined
                  ? action.payload
                  : fallback?.payload || { query: intent.label },
              confidence:
                typeof action.confidence === "number"
                  ? Math.min(Math.max(action.confidence, 0.1), 1)
                  : fallback?.confidence || 0.7,
              reasoning:
                action.reasoning ||
                fallback?.reasoning ||
                "AI suggested next step",
            };
          })
          .filter(Boolean);

        if (remapped.length > 0) {
          nudge.suggestedActions = remapped as typeof nudge.suggestedActions;
        }
      }
    } catch (error) {
      console.warn("NudgeGenerator: AI enhancement skipped", error);
    }

    return nudge;
  }
}

export const nudgeGenerator = new NudgeGenerator();
