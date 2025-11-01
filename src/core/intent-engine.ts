import type { PageData } from "@/types/page";
import type { Intent } from "@/types/intent";
import { aiPipeline } from "./ai-pipeline";
import { storage } from "./storage-manager";
import { processingQueue } from "./processing-queue";
import { mergeCoordinator } from "./merge-coordinator";
import { transitionStatus } from "./intent-state";
import { knowledgeGraph } from "./knowledge-graph";
import { detectIntentCompletion } from "./completion-detector";
import {
  createEmbedding,
  cosineSimilarity,
  keywordSimilarity,
  entitySimilarity,
} from "./semantic-similarity";

interface IntentMatch {
  intent: Intent;
  score: number;
  confidence: number;
}

class IntentEngine {
  private totalIntentsCreated = 0; // Counter for batch merge checks
  /**
   * Fast path: Save page immediately, queue AI processing
   */
  async processNewPage(pageData: PageData): Promise<void> {
    // IMMEDIATE: Save page with raw data (no AI, ~10ms)
    const finalPage = await storage.savePage(pageData);
    console.log(
      `IntentEngine: Page saved: ${finalPage.title} (${finalPage.id})`
    );

    // QUEUE: Only queue for the final saved page (might be merged)
    // Priority order: lower number = higher priority
    // 1: Semantic extraction (needed first for intent matching)
    // 2: Intent matching (depends on semantic extraction)
    // 3: Summarization (can run in parallel, lower priority)

    // Semantic extraction (AI, ~12s, async) - HIGHEST PRIORITY
    await processingQueue.addTask(
      "semantic_extraction",
      finalPage.id,
      1,
      finalPage.title,
      finalPage.url
    );

    // Behavioral classification (AI, ~5s, async) - PRIORITY 3
    await processingQueue.addTask(
      "classify_behavior",
      finalPage.id,
      3,
      finalPage.title,
      finalPage.url
    );

    // Summarization if needed (AI, ~4s, async) - LOWER PRIORITY
    if (finalPage.content && finalPage.content.length > 5000) {
      await processingQueue.addTask(
        "summarization",
        finalPage.id,
        4,
        finalPage.title,
        finalPage.url
      );
    }

    // Intent matching will be queued by semantic_extraction completion (priority 2)
    // Don't queue here - will be queued after features extracted

    console.log(`IntentEngine: Queued AI tasks for ${finalPage.id}`);
  }

  /**
   * Process queued intent matching task
   */
  async matchPageToIntentWithDebug(pageData: PageData): Promise<string | null> {
    await this.matchPageToIntent(pageData);
    return pageData.intentAssignments.primary?.intentId || null;
  }

  async matchPageToIntent(pageData: PageData): Promise<void> {
    // Semantic features must be present
    if (!pageData.semanticFeatures) {
      const error = `Page ${pageData.id} (${pageData.title}) has no semantic features - cannot match`;
      console.error("IntentEngine:", error);
      throw new Error(error); // Throw to trigger retry
    }

    console.log(`IntentEngine: Matching "${pageData.title}" to intents...`);

    // Detect language if not present
    if (!pageData.metadata.detectedLanguage) {
      const langResult = await aiPipeline.detectLanguage(
        pageData.content || pageData.contentSummary || pageData.title
      );
      pageData.metadata.detectedLanguage = langResult.detectedLanguage;
      pageData.metadata.languageConfidence = langResult.confidence;
    }

    // Create embedding
    pageData.embedding = createEmbedding(pageData);
    pageData.processedAt = Date.now();

    // Find matching intents
    const matches = await this.findMatchingIntents(pageData);

    // Assign to intent or create new
    await this.assignPageToIntent(pageData, matches);

    // Save with intent assignment
    await storage.savePage(pageData);

    console.log(`IntentEngine: ✓ Matched page to intent`);
  }

  private async findMatchingIntents(page: PageData): Promise<IntentMatch[]> {
    const recentIntents = await storage.getRecentIntents(30);
    const matches: IntentMatch[] = [];

    for (const intent of recentIntents) {
      const score = await this.calculateIntentMatch(page, intent);
      const confidence = Math.round(score * 100);

      if (confidence >= 50) {
        matches.push({ intent, score, confidence });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  private async calculateIntentMatch(
    page: PageData,
    intent: Intent
  ): Promise<number> {
    const intentPages = await storage.getPagesByIntent(intent.id);
    if (intentPages.length === 0) return 0;

    // Signal 1: Semantic Similarity (30% weight)
    let semanticScore = 0;
    let totalWeight = 0;

    for (const intentPage of intentPages) {
      if (intentPage.embedding && page.embedding) {
        const similarity = cosineSimilarity(
          page.embedding,
          intentPage.embedding
        );
        const weight = intentPage.interactions.engagementScore;
        semanticScore += similarity * weight;
        totalWeight += weight;
      }
    }
    semanticScore = totalWeight > 0 ? semanticScore / totalWeight : 0;

    // Signal 2: Keyword Overlap (20% weight)
    const pageConcepts = page.semanticFeatures?.concepts || [];
    const intentConcepts = Array.from(
      Object.keys(intent.aggregatedSignals?.keywords || {})
    );
    const keywordScore = keywordSimilarity(pageConcepts, intentConcepts);

    // Signal 3: Entity Continuity (15% weight)
    const pageEntities = page.semanticFeatures?.entities || {
      people: [],
      places: [],
      organizations: [],
      products: [],
      topics: [],
    };
    const intentEntities = intent.aggregatedSignals?.entities || {
      people: [],
      places: [],
      organizations: [],
      products: [],
      topics: [],
    };
    const entityScore = entitySimilarity(pageEntities, intentEntities);

    // Signal 4: Temporal Proximity (15% weight)
    const daysSinceUpdate =
      (Date.now() - intent.lastUpdated) / (24 * 60 * 60 * 1000);
    const temporalScore = Math.exp(-daysSinceUpdate / 30);

    // Signal 5: Domain Continuity (10% weight)
    const pageDomain = page.metadata.domain;
    const intentDomains = intent.aggregatedSignals?.domains || [];
    const domainScore = intentDomains.includes(pageDomain) ? 1.0 : 0.0;

    // Signal 6: Behavioral Pattern Match (10% weight)
    const pageEngagement = page.interactions.engagementScore;
    const intentAvgEngagement =
      intent.aggregatedSignals?.patterns?.avgEngagement || 0.5;
    const behavioralScore =
      1.0 - Math.abs(pageEngagement - intentAvgEngagement);

    // Weighted sum
    const finalScore =
      semanticScore * 0.3 +
      keywordScore * 0.2 +
      entityScore * 0.15 +
      temporalScore * 0.15 +
      domainScore * 0.1 +
      behavioralScore * 0.1;

    return finalScore;
  }

  private async assignPageToIntent(
    page: PageData,
    matches: IntentMatch[]
  ): Promise<void> {
    if (matches.length === 0 || matches[0].confidence < 55) {
      // Check if this is an error page (404/error) - don't create intent
      if (page.metadata.titleContains404 || page.metadata.titleContainsError) {
        console.log(
          `IntentEngine: Skipping intent creation for error page: ${page.title}`
        );
        // Mark page as processed but don't create intent
        page.intentAssignments = {
          primary: null,
          secondary: [],
        };
        await storage.savePage(page);
        return; // Exit early, no intent or tasks created
      }

      // Not an error page, proceed with intent creation
      await this.createNewIntent(page);

      // Queue AI verification in background (priority 15)
      await processingQueue.addTask("ai_verify_intent_matching", page.id, 15);
    } else {
      const bestMatch = matches[0];

      // Assign to existing intent
      page.intentAssignments = {
        primary: {
          intentId: bestMatch.intent.id,
          confidence: bestMatch.confidence / 100,
          role: "primary",
          assignedAt: Date.now(),
          autoAssigned: bestMatch.confidence >= 70,
          needsConfirmation: bestMatch.confidence < 70,
        },
        secondary: [],
      };

      console.log(
        `IntentEngine: Assigning page ${page.id.slice(
          -8
        )} to intent ${bestMatch.intent.id.slice(-8)} (${Math.round(
          bestMatch.confidence
        )}% confidence)`
      );

      // CRITICAL: Save page with new assignment BEFORE updating intent
      await storage.savePage(page);

      // VERIFICATION: Reload page to ensure assignment persisted
      let retryCount = 0;
      let verified = false;
      while (retryCount < 3 && !verified) {
        const reloaded = await storage.getPage(page.id);
        if (
          reloaded?.intentAssignments?.primary?.intentId === bestMatch.intent.id
        ) {
          verified = true;
          console.log(`IntentEngine: ✓ Page assignment verified`);
        } else {
          retryCount++;
          console.warn(
            `IntentEngine: ⚠️  Assignment verification failed (attempt ${retryCount}/3), retrying save...`
          );
          await storage.savePage(page);
          // Small delay to let IndexedDB commit
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      if (!verified) {
        console.error(
          `IntentEngine: ❌ Page assignment failed to persist after 3 retries!`,
          `Page: ${page.id}, Intent: ${bestMatch.intent.id}`
        );
      }

      // Update intent
      await this.updateIntent(bestMatch.intent, page);

      // ALWAYS queue AI verification in background (catches merge opportunities)
      await processingQueue.addTask("ai_verify_intent_matching", page.id, 15);
    }
  }

  private async createNewIntent(page: PageData): Promise<void> {
    const intentId = `intent-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const intent: Intent = {
      id: intentId,
      label: "Analyzing browsing pattern...", // Temporary placeholder
      labelConfidence: 0.1,
      labelUpdatedAt: Date.now(),
      confidence: 60,
      status: "emerging",
      firstSeen: page.timestamp,
      lastUpdated: page.timestamp,
      pageCount: 1,
      pageIds: [page.id],
      aggregatedSignals: {
        keywords: this.initializeKeywordsFromPage(page),
        entities: page.semanticFeatures?.entities || {
          people: [],
          places: [],
          organizations: [],
          products: [],
          topics: [],
        },
        domains: [page.metadata.domain],
        patterns: {
          avgEngagement: page.interactions.engagementScore,
          avgDwellTime: page.interactions.dwellTime,
          avgScrollDepth: page.interactions.scrollDepth,
          browsingStyle: "exploratory",
        },
        cachedForPageCount: 1,
      },
      relatedIntents: [],
      userFeedback: { discarded: false },
      timeline: [
        {
          date: new Date(page.timestamp).toISOString().split("T")[0],
          event: "created",
          details: `Started with: ${page.title}`,
        },
      ],
    };

    // Assign page to this new intent
    page.intentAssignments = {
      primary: {
        intentId,
        confidence: 0.6,
        role: "primary",
        assignedAt: Date.now(),
        autoAssigned: true,
      },
      secondary: [],
    };

    console.log(
      `IntentEngine: Creating new intent ${intentId.slice(
        -8
      )} for page ${page.id.slice(-8)}`
    );

    // CRITICAL: Save both intent AND page
    await storage.saveIntent(intent);
    await storage.savePage(page);

    // VERIFICATION: Reload page to ensure assignment persisted
    let retryCount = 0;
    let verified = false;
    while (retryCount < 3 && !verified) {
      const reloaded = await storage.getPage(page.id);
      if (reloaded?.intentAssignments?.primary?.intentId === intentId) {
        verified = true;
        console.log(`IntentEngine: ✓ Page assignment verified`);
      } else {
        retryCount++;
        console.warn(
          `IntentEngine: ⚠️  New intent assignment verification failed (attempt ${retryCount}/3), retrying...`
        );
        await storage.savePage(page);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    if (!verified) {
      console.error(
        `IntentEngine: ❌ Page assignment failed to persist for new intent after 3 retries!`,
        `Page: ${page.id}, Intent: ${intentId}`
      );
    }

    console.log(
      `IntentEngine: ✓ Created intent "${intent.label}" (${intent.id}) with status: ${intent.status}`
    );

    // Increment intent creation counter
    this.totalIntentsCreated++;

    // Auto-queue intent feature generation (background tasks)
    // Priority 5-6: Label & Goal (important - updates placeholders)
    // Priority 20-22: Features (can wait, goal/insights affect next steps)
    await processingQueue.addTask("generate_intent_label", intent.id, 5);
    await processingQueue.addTask("generate_intent_goal", intent.id, 6);
    await processingQueue.addTask("generate_intent_summary", intent.id, 20);
    await processingQueue.addTask("generate_intent_insights", intent.id, 21);
    await processingQueue.addTask("generate_intent_next_steps", intent.id, 22);

    console.log(
      `IntentEngine: Queued intent feature generation for ${intent.id}`
    );

    // OPTIMIZATION: Notify merge coordinator (debounced, deduped scanning)
    mergeCoordinator.onIntentChanged(intent.id);

    // Update knowledge graph with new intent
    await knowledgeGraph.updateFromIntent(intent);
  }

  private async updateIntent(intent: Intent, newPage: PageData): Promise<void> {
    // Add page to intent
    intent.pageIds.push(newPage.id);
    intent.pageCount = intent.pageIds.length;
    intent.lastUpdated = newPage.timestamp;

    // Add timeline event for page addition
    intent.timeline.push({
      date: new Date().toISOString().split("T")[0],
      event: "page_added",
      details: `Added: ${newPage.title.substring(0, 50)}`,
      pageId: newPage.id,
      pageTitle: newPage.title,
      newPageCount: intent.pageCount,
    });

    // Update status (using state machine)
    if (intent.pageCount >= 3 && intent.status === "emerging") {
      transitionStatus(intent, "active", "Auto-transitioned: Reached 3 pages", {
        triggeredBy: "page_count",
        threshold: 3,
      });
    }

    // Recompute aggregated signals
    const allPages = await storage.getPagesByIntent(intent.id);

    // Update keywords
    const keywordMap = new Map<
      string,
      { count: number; totalEngagement: number }
    >();
    allPages.forEach((p) => {
      (p.semanticFeatures?.concepts || []).forEach((concept) => {
        const current = keywordMap.get(concept) || {
          count: 0,
          totalEngagement: 0,
        };
        keywordMap.set(concept, {
          count: current.count + 1,
          totalEngagement:
            current.totalEngagement + p.interactions.engagementScore,
        });
      });
    });

    intent.aggregatedSignals.keywords = Object.fromEntries(
      Array.from(keywordMap.entries()).map(([word, stats]) => [
        word,
        {
          count: stats.count,
          avgEngagement: stats.totalEngagement / stats.count,
          totalEngagement: stats.totalEngagement,
          recency: 1.0,
        },
      ])
    );

    // Update domains
    const domains = new Set(allPages.map((p) => p.metadata.domain));
    intent.aggregatedSignals.domains = Array.from(domains);

    // Update patterns
    const totalEngagement = allPages.reduce(
      (sum, p) => sum + p.interactions.engagementScore,
      0
    );
    const totalDwell = allPages.reduce(
      (sum, p) => sum + p.interactions.dwellTime,
      0
    );
    const totalScroll = allPages.reduce(
      (sum, p) => sum + p.interactions.scrollDepth,
      0
    );

    intent.aggregatedSignals.patterns = {
      avgEngagement: totalEngagement / allPages.length,
      avgDwellTime: totalDwell / allPages.length,
      avgScrollDepth: totalScroll / allPages.length,
      browsingStyle:
        totalEngagement / allPages.length > 0.7 ? "focused" : "exploratory",
    };

    // CRITICAL: Mark cache as valid for current page count
    intent.aggregatedSignals.cachedForPageCount = allPages.length;

    // Refresh label if needed (every 2-3 pages)
    if (intent.pageCount % 2 === 0 && intent.pageCount > 2) {
      const labelResult = await aiPipeline.generateIntentLabel(allPages);
      if (labelResult.confidence > intent.labelConfidence + 0.1) {
        const oldLabel = intent.label;
        intent.previousLabel = intent.label;
        intent.label = labelResult.label;
        intent.labelConfidence = labelResult.confidence;
        intent.labelUpdatedAt = Date.now();

        // Add label change to timeline
        intent.timeline.push({
          date: new Date().toISOString().split("T")[0],
          event: "label_changed",
          details: `Label updated to "${labelResult.label}"`,
          from: oldLabel,
          to: labelResult.label,
          confidence: labelResult.confidence,
          source: "ai",
        });
      }
    }

    await storage.saveIntent(intent);

    // Check for intent completion
    const completionCheck = await detectIntentCompletion(intent, newPage);

    if (completionCheck.completed && intent.status === "active") {
      transitionStatus(
        intent,
        "completed",
        `Auto-completed: ${completionCheck.reason}`,
        {
          confidence: completionCheck.confidence,
          evidence: completionCheck.evidence,
        }
      );

      await storage.saveIntent(intent);
      console.log(
        `IntentEngine: Intent ${intent.id} auto-completed: ${completionCheck.reason}`
      );
    }

    // Notify merge coordinator of intent change
    mergeCoordinator.onIntentChanged(intent.id);

    // Auto-refresh intent features every 3 pages
    if (intent.pageCount % 3 === 0 && intent.pageCount >= 3) {
      console.log(
        `IntentEngine: Refreshing intent features for ${intent.id} (${intent.pageCount} pages)`
      );
      await processingQueue.addTask("generate_intent_label", intent.id, 5);
      await processingQueue.addTask("generate_intent_goal", intent.id, 6);
      await processingQueue.addTask("generate_intent_summary", intent.id, 20);
      await processingQueue.addTask("generate_intent_insights", intent.id, 21);
      await processingQueue.addTask(
        "generate_intent_next_steps",
        intent.id,
        22
      );
    }

    // Update knowledge graph with updated intent
    await knowledgeGraph.updateFromIntent(intent);
  }

  /**
   * Validate merged intent after merge completes
   * Detects if the merged intent has contradictory concepts
   */
  private async validateMergedIntent(
    mergedIntent: Intent,
    pages?: PageData[]
  ): Promise<{ valid: boolean; warning?: string }> {
    const intentPages =
      pages && pages.length > 0
        ? pages
        : await storage.getPagesByIntent(mergedIntent.id);

    const keywords = Object.keys(mergedIntent.aggregatedSignals.keywords).slice(
      0,
      20
    );

    const lowerKeywords = keywords.map((k) => k.toLowerCase());

    const bridgingTerms = [
      "compare",
      "comparison",
      "vs",
      "versus",
      "integration",
      "full stack",
      "stack",
      "architecture",
      "backend",
      "frontend",
      "overview",
    ];

    const hasBridgeKeyword = lowerKeywords.some((keyword) =>
      bridgingTerms.some((term) => keyword.includes(term))
    );

    const hasBridgeInLabel = mergedIntent.label
      ? bridgingTerms.some((term) =>
          mergedIntent.label.toLowerCase().includes(term)
        )
      : false;

    const hasBridgeInPages = intentPages.some((page) => {
      const haystack = `${page.title} ${
        page.contentSummary || ""
      }`.toLowerCase();
      return bridgingTerms.some((term) => haystack.includes(term));
    });

    // Check for contradictory concepts in merged intent
    const contradictionGroups = [
      {
        name: "programming_languages",
        terms: [
          "React",
          "Python",
          "Vue",
          "Angular",
          "Java",
          "C++",
          "Ruby",
          "Go",
        ],
        allowMultiple: false,
      },
      {
        name: "sports",
        terms: [
          "tennis",
          "basketball",
          "soccer",
          "swimming",
          "football",
          "baseball",
        ],
        allowMultiple: false,
      },
      {
        name: "shopping_vs_learning",
        terms: [
          "price",
          "buy",
          "purchase",
          "learn",
          "tutorial",
          "documentation",
        ],
        allowMultiple: true, // Can shop for learning materials
      },
    ];

    for (const group of contradictionGroups) {
      if (group.allowMultiple) continue;

      const matches = group.terms.filter((term) =>
        keywords.some((k) => k.toLowerCase().includes(term.toLowerCase()))
      );

      if (matches.length > 1) {
        const supportCounts = new Map<string, number>();

        for (const match of matches) {
          const lowerMatch = match.toLowerCase();
          let count = 0;
          for (const page of intentPages) {
            const pageContent = `${page.title} ${
              page.contentSummary || ""
            }`.toLowerCase();
            const concepts = (page.semanticFeatures?.concepts || []).map((c) =>
              c.toLowerCase()
            );
            if (
              pageContent.includes(lowerMatch) ||
              concepts.some((c) => c.includes(lowerMatch))
            ) {
              count++;
            }
          }
          supportCounts.set(match, count);
        }

        const minimumSupport = Math.max(
          1,
          Math.round(intentPages.length * 0.25)
        );

        const supportedMatches = [...supportCounts.entries()].filter(
          ([, count]) => count >= minimumSupport
        );

        if (supportedMatches.length <= 1) {
          continue;
        }

        if (hasBridgeKeyword || hasBridgeInLabel || hasBridgeInPages) {
          continue;
        }

        return {
          valid: false,
          warning: `Contradictory ${group.name} detected: ${matches.join(
            ", "
          )}. This suggests an incorrect merge.`,
        };
      }
    }

    // Check domain diversity (too many different domain types might indicate bad merge)
    const domains = mergedIntent.aggregatedSignals.domains;
    const getDomainCategory = (domain: string): string => {
      if (domain.match(/\.(dev|org)$/)) return "tech_docs";
      if (domain.match(/(yelp|review|rating|tripadvisor)/)) return "reviews";
      if (domain.includes("google.com")) return "search";
      if (domain.match(/(amazon|shop|store|buy)/)) return "shopping";
      if (domain.match(/(github|stackoverflow|dev\.to)/))
        return "dev_community";
      return "general";
    };

    const categories = new Set(domains.map(getDomainCategory));

    // More than 3 different domain categories might indicate overly broad intent
    if (categories.size > 3) {
      return {
        valid: false,
        warning: `High domain diversity (${
          categories.size
        } categories: ${Array.from(categories).join(
          ", "
        )}). Intent may be too broad.`,
      };
    }

    return { valid: true };
  }

  private async aiReviewMerge(
    sourceIntent: Intent,
    targetIntent: Intent
  ): Promise<{ approved: boolean; confidence: number; reason?: string }> {
    try {
      await aiPipeline.initialize();
    } catch (error) {
      console.warn("IntentEngine: AI merge review unavailable", error);
    }

    if (!aiPipeline.isAvailable()) {
      return { approved: true, confidence: 0.4 };
    }

    try {
      const session = await aiPipeline.getSession({
        temperature: 0.2,
        topK: 1,
      });

      const formatKeywords = (intent: Intent): string =>
        Object.keys(intent.aggregatedSignals.keywords)
          .slice(0, 10)
          .join(", ") || "(none)";

      const intentSummary = (intent: Intent): string => {
        if (intent.aiSummary) return intent.aiSummary.slice(0, 280);
        const timelineSummary = intent.timeline
          .slice(-2)
          .map((event) => `${event.event}: ${event.details}`)
          .join(" | ");
        return timelineSummary || "Recent browsing without AI summary";
      };

      const prompt = `Decide if two browsing intents belong to the same underlying user goal.

INTENT A
- Label: ${sourceIntent.label}
- Status: ${sourceIntent.status}
- Domains: ${sourceIntent.aggregatedSignals.domains.join(", ") || "(none)"}
- Top Keywords: ${formatKeywords(sourceIntent)}
- Summary: ${intentSummary(sourceIntent)}

INTENT B
- Label: ${targetIntent.label}
- Status: ${targetIntent.status}
- Domains: ${targetIntent.aggregatedSignals.domains.join(", ") || "(none)"}
- Top Keywords: ${formatKeywords(targetIntent)}
- Summary: ${intentSummary(targetIntent)}

RULES
- Approve merge only if intents clearly refer to the same topic, location, and objective.
- Reject merges that mix unrelated geographies, industries, or activities (e.g., "Fremont real estate" with "Folcroft real estate" or "React" with "Tennis").
- Highlight any conflicting signals (keywords, domains, summaries).

Return ONLY valid JSON:
{
  "shouldMerge": false,
  "confidence": 0.2,
  "reason": "They focus on different cities (Fremont vs Folcroft).",
  "conflicts": ["Location mismatch: Fremont vs Folcroft"]
}`;

      const response = await session.prompt(prompt);
      const cleaned = response
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

      if (parsed && typeof parsed.shouldMerge === "boolean") {
        return {
          approved: parsed.shouldMerge,
          confidence: Math.min(
            Math.max(Number(parsed.confidence) || 0.4, 0),
            1
          ),
          reason:
            typeof parsed.reason === "string"
              ? parsed.reason
              : parsed.shouldMerge
              ? "AI approved merge"
              : "AI rejected merge",
        };
      }
    } catch (error) {
      console.warn("IntentEngine: AI merge review failed", error);
    }

    return { approved: true, confidence: 0.4 };
  }

  /**
   * Validate if two intents should be merged
   * Prevents incorrect merges like mixing React + Tennis
   */
  private async validateMerge(
    sourceIntent: Intent,
    targetIntent: Intent
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check 1: Domain overlap (at least 1 shared domain or similar domain patterns)
    const sourceDomains = new Set(sourceIntent.aggregatedSignals.domains);
    const targetDomains = new Set(targetIntent.aggregatedSignals.domains);
    const sharedDomains = Array.from(sourceDomains).filter((d) =>
      targetDomains.has(d)
    );

    // Extract domain types for similarity check
    const getDomainType = (domain: string): string => {
      // react.dev, python.org -> tech docs
      if (domain.match(/\.(dev|org)$/)) return "tech_docs";
      // yelp.com, tripadvisor.com -> reviews
      if (domain.match(/(yelp|review|rating)/)) return "reviews";
      // google.com searches
      if (domain.includes("google.com")) return "search";
      return "general";
    };

    const sourceTypes = new Set(Array.from(sourceDomains).map(getDomainType));
    const targetTypes = new Set(Array.from(targetDomains).map(getDomainType));
    const sharedTypes = Array.from(sourceTypes).filter((t) =>
      targetTypes.has(t)
    );

    // Check 2: Concept similarity (calculate overlap)
    const sourceKeywords = new Set(
      Object.keys(sourceIntent.aggregatedSignals.keywords).slice(0, 15)
    );
    const targetKeywords = new Set(
      Object.keys(targetIntent.aggregatedSignals.keywords).slice(0, 15)
    );

    const sharedKeywords = Array.from(sourceKeywords).filter((k) =>
      targetKeywords.has(k)
    );

    const conceptOverlapRatio =
      sharedKeywords.length /
      Math.min(sourceKeywords.size, targetKeywords.size);

    // Check 3: Detect contradictory concepts
    const contradictionPairs = [
      ["React", "Python", "Vue", "Angular", "Java", "C++"], // Different tech
      ["tennis", "basketball", "soccer", "swimming"], // Different sports
      ["shopping", "learning", "research"], // Different actions
    ];

    for (const group of contradictionPairs) {
      const sourceHas = group.filter((term) =>
        Array.from(sourceKeywords).some((k) =>
          k.toLowerCase().includes(term.toLowerCase())
        )
      );
      const targetHas = group.filter((term) =>
        Array.from(targetKeywords).some((k) =>
          k.toLowerCase().includes(term.toLowerCase())
        )
      );

      // If they have different items from same group, likely contradictory
      if (
        sourceHas.length > 0 &&
        targetHas.length > 0 &&
        sourceHas[0] !== targetHas[0]
      ) {
        return {
          valid: false,
          reason: `Contradictory concepts detected: "${sourceHas[0]}" vs "${targetHas[0]}"`,
        };
      }
    }

    // CONTEXT-AWARE Validation Rules
    // Different thresholds based on domain relationship

    // Case 1: Same exact domain (e.g., both react.dev)
    const hasExactDomainMatch = sharedDomains.length > 0;

    // Case 2: Same domain category (e.g., both tech_docs or both reviews)
    const sameDomainCategory =
      sharedTypes.length > 0 &&
      sharedTypes.length === sourceTypes.size &&
      sharedTypes.length === targetTypes.size;

    // Case 3: Different domain categories
    const crossCategory = !hasExactDomainMatch && !sameDomainCategory;

    if (hasExactDomainMatch) {
      // SAME DOMAIN (e.g., both react.dev): Very permissive
      // Rationale: Same site = related research topic, trust AI semantic understanding
      // Example: "React Quick Start" + "React Hooks" = same overall React learning
      if (conceptOverlapRatio < 0.05) {
        return {
          valid: false,
          reason: `Same-domain merge but concepts too divergent: ${Math.round(
            conceptOverlapRatio * 100
          )}% overlap (minimum 5% for same domain)`,
        };
      }
      console.log(
        `Validation: Same-domain merge (${
          sharedDomains[0]
        }), permissive threshold (${Math.round(
          conceptOverlapRatio * 100
        )}% ≥ 5%)`
      );
    } else if (sameDomainCategory) {
      // SAME CATEGORY (e.g., google.com + yelp.com for tennis): Moderate
      // Rationale: Similar source types, need decent topical overlap
      if (conceptOverlapRatio < 0.15) {
        return {
          valid: false,
          reason: `Same-category merge but insufficient overlap: ${Math.round(
            conceptOverlapRatio * 100
          )}% (minimum 15% for same category)`,
        };
      }
      console.log(
        `Validation: Same-category merge (${Array.from(sharedTypes).join(
          ", "
        )}), moderate threshold (${Math.round(
          conceptOverlapRatio * 100
        )}% ≥ 15%)`
      );
    } else if (crossCategory) {
      // CROSS-CATEGORY (e.g., react.dev + yelp.com): Very strict
      // Rationale: Different source types, need strong topical overlap
      if (conceptOverlapRatio < 0.3) {
        return {
          valid: false,
          reason: `Cross-category merge rejected: ${Math.round(
            conceptOverlapRatio * 100
          )}% overlap (minimum 30% for different categories)`,
        };
      }
      console.log(
        `Validation: Cross-category merge, strict threshold (${Math.round(
          conceptOverlapRatio * 100
        )}% ≥ 30%)`
      );
    } else {
      // Fallback: No domain overlap at all
      if (conceptOverlapRatio < 0.3) {
        return {
          valid: false,
          reason: `No domain overlap and insufficient concepts: ${Math.round(
            conceptOverlapRatio * 100
          )}%`,
        };
      }
    }

    // All checks passed
    const aiReview = await this.aiReviewMerge(sourceIntent, targetIntent);
    if (!aiReview.approved) {
      return {
        valid: false,
        reason:
          aiReview.reason ||
          "AI guardrail blocked merge due to conflicting context",
      };
    }

    if (aiReview.confidence < 0.45) {
      return {
        valid: false,
        reason: aiReview.reason || "Low confidence in merge decision",
      };
    }

    return { valid: true };
  }

  /**
   * Merge two intents (source into target) with transactional page reassignment
   * Called by AI verification when it detects intents should be combined
   */
  async mergeIntents(
    sourceIntentId: string,
    targetIntentId: string
  ): Promise<void> {
    console.log(
      `IntentEngine: Starting transactional merge ${sourceIntentId} → ${targetIntentId}`
    );

    // PHASE 1: Validate & Prepare
    const sourceIntent = await storage.getIntent(sourceIntentId);
    const targetIntent = await storage.getIntent(targetIntentId);

    if (!sourceIntent || !targetIntent) {
      throw new Error("Intent not found for merge");
    }

    // VALIDATION: Check if merge makes sense
    const validation = await this.validateMerge(sourceIntent, targetIntent);

    // LOG MERGE ATTEMPT (Structured for debugging and analysis)
    const mergeAttemptLog = {
      timestamp: Date.now(),
      source: {
        id: sourceIntentId,
        label: sourceIntent.label,
        domains: sourceIntent.aggregatedSignals.domains,
        topConcepts: Object.keys(sourceIntent.aggregatedSignals.keywords).slice(
          0,
          5
        ),
        pageCount: sourceIntent.pageCount,
      },
      target: {
        id: targetIntentId,
        label: targetIntent.label,
        domains: targetIntent.aggregatedSignals.domains,
        topConcepts: Object.keys(targetIntent.aggregatedSignals.keywords).slice(
          0,
          5
        ),
        pageCount: targetIntent.pageCount,
      },
      validation: {
        passed: validation.valid,
        reason: validation.reason,
      },
    };

    if (!validation.valid) {
      console.warn(
        `❌ MERGE ATTEMPT FAILED:`,
        JSON.stringify(mergeAttemptLog, null, 2)
      );
      throw new Error(`Merge validation failed: ${validation.reason}`);
    }

    console.log(
      `✓ MERGE ATTEMPT APPROVED:`,
      JSON.stringify(mergeAttemptLog, null, 2)
    );

    // PHASE 2: Load ALL pages (CRITICAL: must get actual page objects)
    const sourcePages = await storage.getPagesByIntent(sourceIntentId);

    if (sourcePages.length === 0 && sourceIntent.pageIds.length > 0) {
      console.warn(
        `⚠️  No pages retrieved for source intent, trying individual fetch...`
      );
      // Fallback: fetch individually
      const pages = [];
      for (const pageId of sourceIntent.pageIds) {
        const page = await storage.getPage(pageId);
        if (page) pages.push(page);
      }
      sourcePages.push(...pages);
    }

    console.log(
      `IntentEngine: Loaded ${sourcePages.length} pages from source intent`
    );

    // PHASE 3: Update Page Assignments FIRST (before intent changes)
    // This ensures pages always point to valid intents
    console.log(
      `IntentEngine: PHASE 3 - Updating ${sourcePages.length} page assignments...`
    );

    const reassignedPages: PageData[] = [];
    for (const page of sourcePages) {
      const oldAssignment = page.intentAssignments.primary;

      // Update assignment to target intent
      page.intentAssignments.primary = {
        intentId: targetIntentId,
        confidence: Math.max(oldAssignment?.confidence || 0.6, 0.7),
        role: "primary",
        assignedAt: Date.now(),
        autoAssigned: true,
        mergedFrom: sourceIntentId, // AUDIT TRAIL
      };

      // Save immediately
      await storage.savePage(page);
      reassignedPages.push(page);

      console.log(`IntentEngine:   ✓ Reassigned page ${page.id.slice(-8)}`);
    }

    // PHASE 3.5: Verify page assignments persisted
    console.log(`IntentEngine: Verifying page assignments...`);
    let verificationFailed = false;
    for (const page of reassignedPages) {
      const reloaded = await storage.getPage(page.id);
      if (
        !reloaded ||
        reloaded.intentAssignments.primary?.intentId !== targetIntentId
      ) {
        console.error(
          `IntentEngine: ❌ Page ${page.id} assignment verification failed!`
        );
        verificationFailed = true;
      }
    }

    if (verificationFailed) {
      throw new Error(
        "Page reassignment verification failed - rolling back merge"
      );
    }

    console.log(
      `IntentEngine: ✓ All page assignments verified (${reassignedPages.length} pages)`
    );

    // Update target intent with merged data
    targetIntent.pageIds.push(...sourceIntent.pageIds);
    targetIntent.pageCount += sourceIntent.pageCount;
    targetIntent.lastUpdated = Date.now();

    // Merge keywords
    for (const [keyword, stats] of Object.entries(
      sourceIntent.aggregatedSignals.keywords
    )) {
      if (targetIntent.aggregatedSignals.keywords[keyword]) {
        const existing = targetIntent.aggregatedSignals.keywords[keyword];
        existing.count += stats.count;
        existing.totalEngagement += stats.totalEngagement;
        existing.avgEngagement = existing.totalEngagement / existing.count;
      } else {
        targetIntent.aggregatedSignals.keywords[keyword] = stats;
      }
    }

    // Merge domains
    const allDomains = new Set([
      ...targetIntent.aggregatedSignals.domains,
      ...sourceIntent.aggregatedSignals.domains,
    ]);
    targetIntent.aggregatedSignals.domains = Array.from(allDomains);

    await storage.saveIntent(targetIntent);

    // CRITICAL FIX: Get pages from MEMORY (known page IDs) not storage query
    // Storage query might return stale data before commit
    const allPageIds = [
      ...new Set([...sourceIntent.pageIds, ...targetIntent.pageIds]),
    ];

    console.log(
      `IntentEngine: Fetching ${allPageIds.length} pages from merge using known IDs...`
    );

    const allPages = (
      await Promise.all(allPageIds.map((id) => storage.getPage(id)))
    ).filter((p): p is PageData => p !== null);

    if (allPages.length !== allPageIds.length) {
      console.warn(
        `⚠️  Only fetched ${allPages.length}/${allPageIds.length} pages`
      );
    }

    // Recalculate patterns from fetched pages
    const totalEngagement = allPages.reduce(
      (sum, p) => sum + p.interactions.engagementScore,
      0
    );
    const totalDwell = allPages.reduce(
      (sum, p) => sum + p.interactions.dwellTime,
      0
    );
    const totalScroll = allPages.reduce(
      (sum, p) => sum + p.interactions.scrollDepth,
      0
    );

    targetIntent.aggregatedSignals.patterns = {
      avgEngagement: totalEngagement / allPages.length,
      avgDwellTime: totalDwell / allPages.length,
      avgScrollDepth: totalScroll / allPages.length,
      browsingStyle:
        totalEngagement / allPages.length > 0.7 ? "focused" : "exploratory",
    };

    targetIntent.aggregatedSignals.cachedForPageCount = allPages.length;

    // Save updated intent with recalculated patterns
    await storage.saveIntent(targetIntent);

    // CRITICAL: Re-save ALL pages to ensure persistence
    console.log(
      `IntentEngine: Re-saving ${allPages.length} pages to ensure persistence...`
    );
    for (const page of allPages) {
      await storage.savePage(page);
    }

    // Verify persistence
    const verifyPage = allPages[0];
    if (verifyPage) {
      const reloaded = await storage.getPage(verifyPage.id);
      if (!reloaded?.intentAssignments?.primary) {
        console.error(
          `⚠️  Merge page persistence verification failed for ${verifyPage.id}!`
        );
      } else {
        console.log(
          `✓ Merge page persistence verified (${allPages.length} pages)`
        );
      }
    }

    // POST-MERGE VALIDATION: Check if merged intent makes sense
    const postMergeValidation = await this.validateMergedIntent(
      targetIntent,
      allPages
    );
    if (!postMergeValidation.valid) {
      console.error(
        `⚠️  Post-merge validation warning for ${targetIntentId}:`,
        postMergeValidation.warning
      );
      // Log warning but don't fail (merge already happened)
      // This helps detect issues for future improvements
    } else {
      console.log(`✓ Post-merge validation passed for ${targetIntentId}`);
    }

    // PHASE 5: Mark source intent as MERGED (using state machine)
    // Prepare merge metadata first
    if (!sourceIntent.metadata) {
      sourceIntent.metadata = {};
    }
    sourceIntent.metadata.mergedInto = targetIntentId;
    sourceIntent.metadata.mergedAt = Date.now();

    // Transition to merged status (adds timeline event automatically)
    transitionStatus(
      sourceIntent,
      "merged",
      `Merged into: ${targetIntent.label}`,
      {
        to: targetIntentId,
        pagesMerged: sourcePages.length,
      }
    );

    await storage.saveIntent(sourceIntent);
    console.log(`IntentEngine: PHASE 5 - Source intent marked as merged`);

    // PHASE 6: Update target intent metadata and timeline
    if (!targetIntent.metadata) {
      targetIntent.metadata = {};
    }
    if (!targetIntent.metadata.mergedFrom) {
      targetIntent.metadata.mergedFrom = [];
    }
    targetIntent.metadata.mergedFrom.push(sourceIntentId);

    // Add timeline event to target intent
    targetIntent.timeline.push({
      date: new Date().toISOString().split("T")[0],
      event: "merged",
      details: `Merged with: ${sourceIntent.label}`,
      sourceIntentId: sourceIntentId,
      pagesMerged: sourcePages.length,
      newPageCount: targetIntent.pageCount,
    });

    await storage.saveIntent(targetIntent);
    console.log(
      `IntentEngine: PHASE 6 - Target intent updated with merge metadata`
    );

    console.log(`IntentEngine: ✓ Transactional merge completed successfully`);

    // Queue label/feature regeneration for merged intent
    await processingQueue.addTask("generate_intent_label", targetIntentId, 5);
    await processingQueue.addTask("generate_intent_goal", targetIntentId, 6);
    await processingQueue.addTask(
      "generate_intent_summary",
      targetIntentId,
      20
    );
  }

  /**
   * Reassign a page to a different intent
   * Called by AI verification when it detects wrong assignment
   */
  async reassignPage(pageId: string, newIntentId: string): Promise<void> {
    console.log(`IntentEngine: Reassigning page ${pageId} to ${newIntentId}`);

    const page = await storage.getPage(pageId);
    const newIntent = await storage.getIntent(newIntentId);

    if (!page || !newIntent) {
      throw new Error("Page or intent not found for reassignment");
    }

    const oldIntentId = page.intentAssignments.primary?.intentId;

    // Update page assignment
    page.intentAssignments.primary = {
      intentId: newIntentId,
      confidence: 0.75,
      role: "primary",
      assignedAt: Date.now(),
      autoAssigned: false,
      needsConfirmation: false,
    };

    await storage.savePage(page);

    // Update new intent
    await this.updateIntent(newIntent, page);

    // Clean up old intent if it has no more pages
    if (oldIntentId) {
      const oldIntent = await storage.getIntent(oldIntentId);
      if (oldIntent) {
        oldIntent.pageIds = oldIntent.pageIds.filter((id) => id !== pageId);
        oldIntent.pageCount = oldIntent.pageIds.length;

        if (oldIntent.pageCount === 0) {
          // Use discarded instead of abandoned (abandoned doesn't exist in new model)
          transitionStatus(
            oldIntent,
            "discarded",
            "Auto-discarded: No pages remaining after reassignment",
            { triggeredBy: "page_reassignment" }
          );
        }

        await storage.saveIntent(oldIntent);
      }
    }

    console.log(`IntentEngine: ✓ Reassigned page successfully`);
  }

  /**
   * Create a new intent from an existing page (split from current intent)
   * Called by AI verification when it detects intent is too broad
   */
  async createNewIntentFromPage(pageId: string): Promise<void> {
    console.log(`IntentEngine: Creating new intent from page ${pageId}`);

    const page = await storage.getPage(pageId);
    if (!page) {
      throw new Error("Page not found for split");
    }

    const oldIntentId = page.intentAssignments.primary?.intentId;

    // Remove from old intent first
    if (oldIntentId) {
      const oldIntent = await storage.getIntent(oldIntentId);
      if (oldIntent) {
        oldIntent.pageIds = oldIntent.pageIds.filter((id) => id !== pageId);
        oldIntent.pageCount = oldIntent.pageIds.length;
        await storage.saveIntent(oldIntent);
      }
    }

    // Create new intent with this page
    await this.createNewIntent(page);

    console.log(`IntentEngine: ✓ Created new intent from page split`);
  }

  private initializeKeywordsFromPage(page: PageData): Record<string, any> {
    const keywords: Record<string, any> = {};

    if (page.semanticFeatures?.concepts) {
      page.semanticFeatures.concepts.forEach((concept) => {
        keywords[concept] = {
          count: 1,
          avgEngagement: page.interactions.engagementScore,
          totalEngagement: page.interactions.engagementScore,
          recency: 1,
        };
      });
    }

    return keywords;
  }

  /**
   * Get aggregated signals with cache validation
   * Recalculates if cache is stale (page count mismatch)
   */
  async getAggregatedSignals(
    intent: Intent
  ): Promise<Intent["aggregatedSignals"]> {
    // Check if cache is valid
    if (intent.aggregatedSignals.cachedForPageCount !== intent.pageCount) {
      console.warn(
        `IntentEngine: Stale cache detected for intent ${intent.id}: ` +
          `cached for ${intent.aggregatedSignals.cachedForPageCount} pages, ` +
          `actually has ${intent.pageCount} pages. Recalculating...`
      );

      // Recalculate aggregated signals
      const allPages = await storage.getPagesByIntent(intent.id);

      // Update keywords
      const keywordMap = new Map<
        string,
        { count: number; totalEngagement: number }
      >();
      allPages.forEach((p) => {
        (p.semanticFeatures?.concepts || []).forEach((concept) => {
          const current = keywordMap.get(concept) || {
            count: 0,
            totalEngagement: 0,
          };
          keywordMap.set(concept, {
            count: current.count + 1,
            totalEngagement:
              current.totalEngagement + p.interactions.engagementScore,
          });
        });
      });

      intent.aggregatedSignals.keywords = Object.fromEntries(
        Array.from(keywordMap.entries()).map(([word, stats]) => [
          word,
          {
            count: stats.count,
            avgEngagement: stats.totalEngagement / stats.count,
            totalEngagement: stats.totalEngagement,
            recency: 1.0,
          },
        ])
      );

      // Update domains
      const domains = new Set(allPages.map((p) => p.metadata.domain));
      intent.aggregatedSignals.domains = Array.from(domains);

      // Update patterns
      const totalEngagement = allPages.reduce(
        (sum, p) => sum + p.interactions.engagementScore,
        0
      );
      const totalDwell = allPages.reduce(
        (sum, p) => sum + p.interactions.dwellTime,
        0
      );
      const totalScroll = allPages.reduce(
        (sum, p) => sum + p.interactions.scrollDepth,
        0
      );

      intent.aggregatedSignals.patterns = {
        avgEngagement: totalEngagement / allPages.length,
        avgDwellTime: totalDwell / allPages.length,
        avgScrollDepth: totalScroll / allPages.length,
        browsingStyle:
          totalEngagement / allPages.length > 0.7 ? "focused" : "exploratory",
      };

      // Update cache marker
      intent.aggregatedSignals.cachedForPageCount = allPages.length;

      // Save recalculated intent
      await storage.saveIntent(intent);

      console.log(
        `IntentEngine: ✓ Recalculated aggregated signals for ${intent.id}`
      );
    }

    return intent.aggregatedSignals;
  }

  /**
   * Invalidate cache for intent (forces recalculation on next access)
   */
  invalidateCache(intent: Intent): void {
    intent.aggregatedSignals.cachedForPageCount = 0;
  }
}

export const intentEngine = new IntentEngine();
