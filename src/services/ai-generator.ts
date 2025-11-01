// AI-powered content generation for intents using Chrome built-in AI
import type { Intent, IntentInsight, NextStep } from "@/types/intent";
import type { PageData } from "@/types/page";

/**
 * Clean AI response to extract JSON (handles markdown code blocks)
 */
function cleanJSONResponse(response: string): string {
  let cleaned = response.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```\s*$/, "");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return jsonMatch ? jsonMatch[0] : cleaned.trim();
}

/**
 * Robust JSON parsing with retry and fallback
 * Handles AI-generated JSON that may have formatting issues
 */
function parseAIJSON(response: string, fallbackValue: any = {}): any {
  const cleaned = cleanJSONResponse(response);

  try {
    // First attempt: standard parse
    return JSON.parse(cleaned);
  } catch (firstError) {
    console.warn("JSON parse failed, attempting cleanup...");

    try {
      // Second attempt: Fix trailing commas
      const fixedCommas = cleaned.replace(/,(\s*[}\]])/g, "$1");
      return JSON.parse(fixedCommas);
    } catch (secondError) {
      try {
        // Third attempt: Fix unquoted keys
        const fixedQuotes = cleaned.replace(
          /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
          '$1"$2":'
        );
        return JSON.parse(fixedQuotes);
      } catch (thirdError) {
        // All attempts failed, use fallback
        console.error("All JSON parse attempts failed, using fallback:", {
          error: String(firstError).substring(0, 100),
          preview: cleaned.substring(0, 200),
        });
        return fallbackValue;
      }
    }
  }
}

/**
 * AI verification result for intent matching
 */
export interface AIVerificationResult {
  action: "agree" | "merge" | "reassign" | "split";
  confidence: number;
  reasoning: string;
  suggestedIntentId?: string;
  intentToMerge?: string;
  mergeInto?: string;
  prompt: string;
  response: string;
}

/**
 * Generate AI insights for an intent using Chrome's LanguageModel
 */
export async function generateIntentInsights(
  intent: Intent,
  pages: PageData[]
): Promise<IntentInsight[]> {
  if (!("LanguageModel" in self)) {
    throw new Error("LanguageModel not available");
  }

  const topKeywords = Object.keys(intent.aggregatedSignals.keywords)
    .slice(0, 10)
    .join(", ");

  const avgEngagement = Math.round(
    intent.aggregatedSignals.patterns.avgEngagement * 100
  );

  const avgDwellTime = Math.round(
    intent.aggregatedSignals.patterns.avgDwellTime / 1000
  );
  const avgScrollDepth = Math.round(
    intent.aggregatedSignals.patterns.avgScrollDepth
  );

  // Include goal if available
  const goalContext = intent.goal ? `\nUSER GOAL: ${intent.goal}\n` : "";

  const prompt = `Analyze this browsing research intent and generate 2-3 CONCISE, specific insights:

INTENT: "${intent.label}"
PAGES: ${pages.length} | DOMAINS: ${intent.aggregatedSignals.domains.join(", ")}
TOP KEYWORDS: ${topKeywords}${goalContext}
METRICS:
- Engagement: ${avgEngagement}% | Dwell: ${avgDwellTime}s | Scroll: ${avgScrollDepth}%
- Style: ${intent.aggregatedSignals.patterns.browsingStyle}

REQUIREMENTS:
1. Text: ONE sentence, 15-25 words max, mention specific keywords
2. Reasoning: 2-3 sentences, 30-50 words, explain the pattern
3. Use metrics as evidence (e.g., "87% engagement indicates...")
4. NO generic phrases like "showing interest"

GOOD EXAMPLE:
{
  "text": "Frequent JSX/Component references with 15s dwell time indicates quick lookup behavior for troubleshooting.",
  "confidence": "high",
  "reasoning": "Low dwell times on foundational concepts suggest users need quick syntax references rather than deep tutorials. Exploratory browsing supports rapid prototyping workflow."
}

BAD EXAMPLE:
{
  "text": "The frequent mention of JSX and Component alongside a relatively low average dwell time of 15 seconds suggests users are quickly referencing core React concepts rather than deeply exploring them.",
  "confidence": "high",
  "reasoning": "JSX and Component are fundamental to React. Low dwell time indicates users are likely looking up specific syntax or definitions..."
}

Return ONLY valid JSON (be concise!):
{
  "insights": [
    {
      "text": "15-25 word insight with specific keywords",
      "confidence": "high|medium|low",
      "reasoning": "30-50 word explanation of the pattern"
    }
  ]
}`;

  const session = await LanguageModel.create({
    temperature: 0.4,
    topK: 3,
  });

  try {
    const response = await session.prompt(prompt);
    const parsed = parseAIJSON(response, { insights: [] });

    return (parsed.insights || []).map((insight: any, idx: number) => ({
      id: `insight-${Date.now()}-${idx}`,
      text: insight.text,
      confidence: insight.confidence || "medium",
      reasoning: insight.reasoning || "Based on browsing patterns",
      source: "ai" as const,
      createdAt: Date.now(),
    }));
  } finally {
    session.destroy();
  }
}

/**
 * Validate that a label is good quality (not a page title copy)
 */
export function isValidIntentLabel(label: string, pages: PageData[]): boolean {
  // 1. Check exact page title match
  for (const page of pages) {
    if (label === page.title) {
      console.warn(`❌ Label exactly matches page title: "${label}"`);
      return false;
    }

    // Check high similarity (>70%)
    const labelWords = new Set(label.toLowerCase().split(/\s+/));
    const titleWords = new Set(page.title.toLowerCase().split(/\s+/));
    const intersection = new Set(
      [...labelWords].filter((x) => titleWords.has(x))
    );
    const similarity =
      intersection.size / Math.min(labelWords.size, titleWords.size);

    if (similarity > 0.7) {
      console.warn(
        `❌ Label too similar to page title "${page.title}": ${Math.round(
          similarity * 100
        )}%`
      );
      return false;
    }
  }

  // 2a. Reject generic fallback phrases (prevents "Researching New Insights")
  const genericPatterns = [
    /researching new insights/i,
    /researching insights/i,
    /general research/i,
    /analyzing browsing pattern/i,
    /learning new insights/i,
    /^researching (a|the) topic/i,
    /^learning about (a|the) topic/i,
  ];

  if (genericPatterns.some((pattern) => pattern.test(label))) {
    console.warn(`❌ Label is too generic: "${label}"`);
    return false;
  }

  // 2. Check forbidden patterns
  const forbiddenPatterns = [
    /–|—/, // En-dash or em-dash
    / - (Google|Yelp|Search|Updated)/i,
    /^TOP \d+/i,
    /Updated \d{4}/i,
    /\|/, // Pipe character
    /^\d+\./, // Starting with number
    /(Best|Top|Official|Home|Welcome)/i, // Common title words
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(label)) {
      console.warn(`❌ Label matches forbidden pattern ${pattern}: "${label}"`);
      return false;
    }
  }

  // 3. Check word count (3-7 words)
  const wordCount = label.trim().split(/\s+/).length;
  if (wordCount < 3 || wordCount > 7) {
    console.warn(`❌ Label has ${wordCount} words, need 3-7: "${label}"`);
    return false;
  }

  // 4. Check starts with action verb
  const actionVerbs = [
    "learning",
    "exploring",
    "finding",
    "researching",
    "shopping",
    "comparing",
    "investigating",
    "understanding",
    "discovering",
    "planning",
    "evaluating",
    "studying",
    "analyzing",
  ];
  const firstWord = label.toLowerCase().split(" ")[0];
  if (!actionVerbs.includes(firstWord)) {
    console.warn(`❌ Label doesn't start with action verb: "${label}"`);
    return false;
  }

  return true;
}

/**
 * Generate intent goal using Chrome's LanguageModel
 * Goal is affected by user interactions and page engagement
 */
export async function generateIntentGoal(
  intent: Intent,
  pages: PageData[]
): Promise<{ goal: string; confidence: number }> {
  if (!("LanguageModel" in self)) {
    throw new Error("LanguageModel not available");
  }

  const topKeywords = Object.keys(intent.aggregatedSignals.keywords)
    .slice(0, 12)
    .join(", ");

  const avgEngagement = Math.round(
    intent.aggregatedSignals.patterns.avgEngagement * 100
  );

  const totalSelections = pages.reduce(
    (sum, p) => sum + p.interactions.textSelections.length,
    0
  );

  const prompt = `Infer the user's research goal from this browsing intent:

INTENT: "${intent.label}"
PAGES: ${pages.length} pages
KEYWORDS: ${topKeywords}
DOMAINS: ${intent.aggregatedSignals.domains.join(", ")}

USER ENGAGEMENT SIGNALS:
- Avg Engagement: ${avgEngagement}%
- Avg Dwell: ${Math.round(
    intent.aggregatedSignals.patterns.avgDwellTime / 1000
  )}s
- Text Selections: ${totalSelections}
- Browsing Style: ${intent.aggregatedSignals.patterns.browsingStyle}

TASK: Infer the user's underlying research goal.

REQUIREMENTS:
1. One sentence, 10-20 words
2. Start with "To..." (infinitive form)
3. Be SPECIFIC based on keywords and behavior
4. Consider engagement level:
   - High engagement (>70%) = Implementation/Application goal
   - Medium engagement (40-70%) = Learning/Understanding goal
   - Low engagement (<40%) = Quick lookup/Reference goal

GOOD EXAMPLES:
✅ "To implement React hooks in a production application"
✅ "To find the best tennis court in Fremont for weekend play"
✅ "To understand Python decorators for code optimization"

BAD EXAMPLES:
❌ "To learn about React" (too vague)
❌ "To find information about tennis courts" (not specific enough)
❌ "To understand the user's research intent" (meta/circular)

Return ONLY valid JSON:
{
  "goal": "To [specific, actionable goal based on data]",
  "confidence": 0.85
}`;

  const session = await LanguageModel.create({
    temperature: 0.5,
    topK: 3,
  });

  try {
    const response = await session.prompt(prompt);
    const parsed = parseAIJSON(response, {
      goal: "To explore this topic further",
      confidence: 0.5,
    });

    return {
      goal: parsed.goal || "To explore this topic further",
      confidence: parsed.confidence || 0.5,
    };
  } finally {
    session.destroy();
  }
}

/**
 * Generate intent summary using Chrome's LanguageModel
 */
export async function generateIntentSummary(
  intent: Intent,
  pages: PageData[]
): Promise<string> {
  if (!("LanguageModel" in self)) {
    throw new Error("LanguageModel not available");
  }

  const topKeywords = Object.keys(intent.aggregatedSignals.keywords)
    .slice(0, 15)
    .join(", ");

  const pageTitles = pages
    .map((p) => p.title)
    .slice(0, 5)
    .join("; ");

  const avgEngagement = Math.round(
    intent.aggregatedSignals.patterns.avgEngagement * 100
  );

  const prompt = `Create a concise 3-4 sentence summary of this browsing intent:

INTENT: "${intent.label}"
PAGES: ${pages.length} pages
PAGE TITLES: ${pageTitles}
TOP KEYWORDS: ${topKeywords}
DOMAINS: ${intent.aggregatedSignals.domains.join(", ")}
AVG ENGAGEMENT: ${avgEngagement}%
BROWSING STYLE: ${intent.aggregatedSignals.patterns.browsingStyle}

REQUIREMENTS:
1. 3-4 sentences maximum (60-80 words total)
2. Explain WHAT the user is exploring/researching
3. Mention KEY findings or patterns observed
4. Use active, clear language (avoid jargon)
5. Focus on the user's journey and discoveries

GOOD EXAMPLE:
"You're exploring React fundamentals with a focus on hooks and component patterns. Your browsing shows particular interest in state management solutions like useReducer and Context API. The 87% engagement across 5 documentation pages suggests you're actively implementing these concepts, not just reading about them."

BAD EXAMPLE:
"This intent is about React. You have visited multiple pages. The user is learning React concepts."

Return ONLY the summary text (NO JSON, NO markdown, NO formatting - just the 3-4 sentences):`;

  const session = await LanguageModel.create({
    temperature: 0.6,
    topK: 3,
  });

  try {
    const response = await session.prompt(prompt);
    return response.trim();
  } finally {
    session.destroy();
  }
}

/**
 * Generate next steps for an intent using Chrome's LanguageModel
 */
export async function generateNextSteps(
  intent: Intent,
  pages: PageData[]
): Promise<NextStep[]> {
  if (!("LanguageModel" in self)) {
    throw new Error("LanguageModel not available");
  }

  const topKeywords = Object.keys(intent.aggregatedSignals.keywords)
    .slice(0, 8)
    .join(", ");

  const domains = intent.aggregatedSignals.domains.join(", ");

  const avgDwellTime = Math.round(
    intent.aggregatedSignals.patterns.avgDwellTime / 1000
  );

  // Include goal and insights if available
  const goalContext = intent.goal ? `\nUSER GOAL: ${intent.goal}` : "";

  const insightsContext =
    intent.insights && intent.insights.length > 0
      ? `\nKEY INSIGHTS:\n${intent.insights
          .map((i, idx) => `${idx + 1}. ${i.text}`)
          .join("\n")}`
      : "";

  const prompt = `Suggest 2-3 SPECIFIC next steps for this research intent:

INTENT: "${intent.label}"
PAGES: ${pages.length} | DOMAINS: ${domains}
KEYWORDS: ${topKeywords}${goalContext}${insightsContext}
DWELL: ${avgDwellTime}s | STYLE: ${intent.aggregatedSignals.patterns.browsingStyle}

REQUIREMENTS:
1. Action: 5-10 words max (verb + specific target)
2. Description: 1 sentence, 15-25 words
3. Reasoning: 1-2 sentences, 25-40 words
4. Include real URLs or specific search queries
5. Base on GAPS in current research

GOOD EXAMPLE:
{
  "action": "Explore React useReducer patterns",
  "description": "Learn complex state management beyond useState",
  "reasoning": "Focused on hooks but haven't explored useReducer - natural progression for advanced state handling",
  "type": "visit",
  "url": "https://react.dev/reference/react/useReducer"
}

BAD EXAMPLE:
{
  "action": "Explore React's Context API documentation",
  "description": "Understand a core mechanism for sharing state across components without prop drilling, which is a common pattern",
  "reasoning": "The user has browsed React's reference overview, indicating an interest in fundamental React concepts. Context API is frequently used for state management in React applications, and it's a natural progression after understanding basic components, JSX, props, and state",
  "type": "visit"
}

Return ONLY valid JSON (keep it concise!):
{
  "nextSteps": [
    {
      "action": "5-10 words with specifics",
      "description": "15-25 word benefit",
      "reasoning": "25-40 word explanation",
      "type": "visit|search",
      "url": "URL if visit",
      "query": "query if search"
    }
  ]
}`;

  const session = await LanguageModel.create({
    temperature: 0.5,
    topK: 4,
  });

  try {
    const response = await session.prompt(prompt);
    const parsed = parseAIJSON(response, { nextSteps: [] });

    return (parsed.nextSteps || []).map((step: any, idx: number) => ({
      id: `step-${Date.now()}-${idx}`,
      action: step.action,
      description: step.description || "",
      reasoning: step.reasoning || "Based on research pattern",
      type: step.type || "visit",
      url: step.url,
      query: step.query,
    }));
  } finally {
    session.destroy();
  }
}

/**
 * Compute similarity score between two intents
 * Returns structured similarity data for filtering
 */
function computeIntentSimilarity(
  intentA: Intent,
  intentB: Intent
): {
  domainOverlap: number;
  conceptOverlap: number;
  sharedDomains: string[];
  sharedConcepts: string[];
  hasContradictions: boolean;
  contradictionReason?: string;
} {
  // Domain overlap
  const domainsA = new Set(intentA.aggregatedSignals.domains);
  const domainsB = new Set(intentB.aggregatedSignals.domains);
  const sharedDomains = Array.from(domainsA).filter((d) => domainsB.has(d));
  const domainOverlap = sharedDomains.length;

  // Concept overlap
  const conceptsA = new Set(
    Object.keys(intentA.aggregatedSignals.keywords).slice(0, 15)
  );
  const conceptsB = new Set(
    Object.keys(intentB.aggregatedSignals.keywords).slice(0, 15)
  );
  const sharedConcepts = Array.from(conceptsA).filter((c) => conceptsB.has(c));
  const conceptOverlapRatio =
    sharedConcepts.length / Math.min(conceptsA.size, conceptsB.size);

  // Check for contradictions
  const contradictionGroups = [
    ["React", "Python", "Vue", "Angular", "Java", "C++", "Ruby"],
    ["tennis", "basketball", "soccer", "swimming", "football"],
    ["shopping", "learning", "research"],
  ];

  let hasContradictions = false;
  let contradictionReason = "";

  for (const group of contradictionGroups) {
    const inA = group.filter((term) =>
      Array.from(conceptsA).some((c) =>
        c.toLowerCase().includes(term.toLowerCase())
      )
    );
    const inB = group.filter((term) =>
      Array.from(conceptsB).some((c) =>
        c.toLowerCase().includes(term.toLowerCase())
      )
    );

    if (inA.length > 0 && inB.length > 0 && inA[0] !== inB[0]) {
      hasContradictions = true;
      contradictionReason = `Contradictory: "${inA[0]}" vs "${inB[0]}"`;
      break;
    }
  }

  return {
    domainOverlap,
    conceptOverlap: conceptOverlapRatio,
    sharedDomains,
    sharedConcepts,
    hasContradictions,
    contradictionReason,
  };
}

/**
 * Scan all intents for merge opportunities
 * Intent-centric (not page-centric) - catches cases page-level verification misses
 */
export async function scanIntentMergeOpportunities(
  _targetIntentId: string | null, // null = scan all (reserved for future use)
  allIntents: Intent[]
): Promise<{
  merges: Array<{
    intentA: string;
    intentB: string;
    confidence: number;
    reasoning: string;
  }>;
  prompt: string;
  response: string;
}> {
  if (!("LanguageModel" in self)) {
    throw new Error("LanguageModel not available");
  }

  // Filter to active/emerging only, limit to 10 most recent
  const activeIntents = allIntents
    .filter((i) => i.status === "active" || i.status === "emerging")
    .sort((a, b) => b.lastUpdated - a.lastUpdated)
    .slice(0, 10);

  // Need at least 2 intents to compare
  if (activeIntents.length < 2) {
    return {
      merges: [],
      prompt: "Not enough active intents to compare",
      response: "{}",
    };
  }

  // PRE-FILTER: Compute similarity for all pairs, only send viable candidates to AI
  const candidatePairs: Array<{
    intentA: Intent;
    intentB: Intent;
    similarity: ReturnType<typeof computeIntentSimilarity>;
  }> = [];

  for (let i = 0; i < activeIntents.length; i++) {
    for (let j = i + 1; j < activeIntents.length; j++) {
      const similarity = computeIntentSimilarity(
        activeIntents[i],
        activeIntents[j]
      );

      // Only consider if: has overlap AND no contradictions AND meets minimum floor
      // Floor: Even with domain overlap, need at least 5% concept overlap (not completely divergent)
      if (
        !similarity.hasContradictions &&
        similarity.conceptOverlap >= 0.05 && // Minimum 5% floor
        (similarity.domainOverlap > 0 || similarity.conceptOverlap >= 0.3)
      ) {
        candidatePairs.push({
          intentA: activeIntents[i],
          intentB: activeIntents[j],
          similarity,
        });
      } else {
        console.log(
          `Pre-filter: Skipping ${activeIntents[i].label} + ${activeIntents[j].label}`,
          `(domain overlap: ${similarity.domainOverlap}, concept: ${Math.round(
            similarity.conceptOverlap * 100
          )}%, contradictions: ${similarity.hasContradictions}${
            similarity.conceptOverlap < 0.05 ? ", below 5% floor" : ""
          })`
        );
      }
    }
  }

  // If no viable candidates, skip AI entirely
  if (candidatePairs.length === 0) {
    console.log("Pre-filter: No viable merge candidates found");
    return {
      merges: [],
      prompt: "No viable merge candidates after pre-filtering",
      response: "{}",
    };
  }

  console.log(
    `Pre-filter: ${candidatePairs.length} viable merge candidates (from ${activeIntents.length} intents)`
  );

  // Build STRUCTURED JSON context (not paragraph format - clearer for AI)
  const candidatesJson = candidatePairs.map((pair, idx) => {
    // Calculate temporal context
    const timeBetweenSeconds =
      Math.abs(pair.intentA.firstSeen - pair.intentB.firstSeen) / 1000;
    const viewedInSequence = timeBetweenSeconds < 120; // Within 2 minutes

    return {
      pair_id: idx + 1,
      intentA: {
        id: pair.intentA.id,
        label: pair.intentA.label,
        domains: pair.intentA.aggregatedSignals.domains,
        top_concepts: Object.keys(
          pair.intentA.aggregatedSignals.keywords
        ).slice(0, 8),
        goal: pair.intentA.goal || "Not set",
        page_count: pair.intentA.pageCount,
      },
      intentB: {
        id: pair.intentB.id,
        label: pair.intentB.label,
        domains: pair.intentB.aggregatedSignals.domains,
        top_concepts: Object.keys(
          pair.intentB.aggregatedSignals.keywords
        ).slice(0, 8),
        goal: pair.intentB.goal || "Not set",
        page_count: pair.intentB.pageCount,
      },
      pre_computed_similarity: {
        shared_domains: pair.similarity.sharedDomains,
        shared_concepts: pair.similarity.sharedConcepts,
        concept_overlap_percent: Math.round(
          pair.similarity.conceptOverlap * 100
        ),
      },
      temporal_context: {
        time_between_intents_seconds: Math.round(timeBetweenSeconds),
        viewed_in_sequence: viewedInSequence,
        same_browsing_session: timeBetweenSeconds < 300, // Within 5 minutes
      },
    };
  });

  const prompt = `Evaluate these PRE-FILTERED merge candidates for final approval.

IMPORTANT: These pairs have already passed basic similarity checks (overlap + no contradictions).
Your job is to make the FINAL decision on whether they should merge.

CANDIDATE PAIRS (JSON FORMAT):
${JSON.stringify(candidatesJson, null, 2)}

EVALUATION CRITERIA:
For each pair, consider ALL available data:

1. **Labels & Goals**: Are they about the SAME research topic?
   - Same topic, different angles = MERGE (e.g., "React basics" + "React hooks")
   - Different topics = DON'T MERGE (e.g., "React" + "Tennis")

2. **Domains**: What do shared domains tell you?
   - Same exact domain (both react.dev) = STRONG merge signal (user researching same site)
   - Same category (both google.com/yelp.com) = MODERATE merge signal (cross-referencing)
   - Different categories (react.dev + yelp.com) = Need HIGH concept overlap

3. **Temporal Context**: When were they viewed?
   - viewed_in_sequence: true (<2 min apart) = STRONG merge signal (consecutive browsing)
   - same_browsing_session: true (<5 min) = MODERATE merge signal
   - Far apart in time = Weaker merge signal

4. **Shared Concepts**: Do they form ONE coherent topic?
   - Look at the ACTUAL shared concepts, not just percentage
   - Low % but meaningful overlap OK for same-domain (e.g., "React" shared = React research)
   - High % needed for cross-domain merges

DECISION RULES:
- Same domain + viewed in sequence → HIGH confidence (0.90-0.95) even if low concept %
- Same domain + same session → MEDIUM-HIGH confidence (0.85-0.90)
- Different domains + high concept overlap (>30%) → MEDIUM confidence (0.85-0.89)
- Different domains + low overlap (<20%) → LOW confidence (<0.85, will not merge)

SPECIAL CASE - Low Concept Overlap:
If concept_overlap_percent < 20%, you MUST justify why it's still a merge:
- "Both on same documentation site (react.dev), different sections of same learning topic"
- "Viewed consecutively (15 seconds apart), clearly same research session"
- If you cannot justify it, give confidence < 0.85

EXAMPLES:
✅ APPROVE 0.93: "React Quick Start" + "React Hooks Reference"
   → Same domain (react.dev), viewed_in_sequence: true, both about React learning

✅ APPROVE 0.90: "Tennis Google" + "Tennis Yelp"  
   → Different domains but 50% concept overlap, same_browsing_session: true, same topic

❌ REJECT 0.75: "React Reference" + "React Basics" 
   → IF viewed 10 minutes apart AND only 5% overlap AND different page counts
   → Might be different sessions or too divergent

Return ONLY valid JSON (evaluate each pair by pair_id):
{
  "merges": [
    {
      "intentA": "intent-xxx",
      "intentB": "intent-yyy", 
      "confidence": 0.92,
      "reasoning": "Pair #1: Both on react.dev, viewed 42 seconds apart (in sequence). Shared concept 'React' represents coherent React learning topic despite 8% overlap. Compatible goals. Same-domain merge with temporal proximity."
    }
  ]
}`;

  const session = await LanguageModel.create({
    temperature: 0.1, // Maximum consistency (lowered from 0.2)
    topK: 1,
  });

  try {
    const response = await session.prompt(prompt);
    const cleaned = cleanJSONResponse(response);
    const parsed = JSON.parse(cleaned);

    return {
      merges: parsed.merges || [],
      prompt,
      response,
    };
  } finally {
    session.destroy();
  }
}

/**
 * AI verification of intent matching assignment
 * Runs in background to catch edge cases algorithmic matching might miss
 */
export async function aiVerifyIntentMatch(
  page: PageData,
  currentIntent: Intent,
  allIntents: Intent[]
): Promise<AIVerificationResult> {
  if (!("LanguageModel" in self)) {
    throw new Error("LanguageModel not available");
  }

  // Build context of other recent intents
  const intentContext = allIntents
    .filter((i) => i.id !== currentIntent.id && i.status !== "completed")
    .slice(0, 5)
    .map(
      (intent, i) => `
${i + 1}. "${intent.label}" (${intent.pageCount} pages, ${intent.status})
   Concepts: ${Object.keys(intent.aggregatedSignals.keywords)
     .slice(0, 8)
     .join(", ")}
   Domains: ${intent.aggregatedSignals.domains.join(", ")}
   ID: ${intent.id}`
    )
    .join("\n");

  const prompt = `Verify if this page was correctly assigned to a browsing intent.

NEW PAGE:
Title: "${page.title}"
URL: ${page.url}
Domain: ${page.metadata.domain}
Concepts: ${(page.semanticFeatures?.concepts || []).slice(0, 12).join(", ")}
Action: ${page.semanticFeatures?.intentSignals.primaryAction || "unknown"}
Goal: ${page.semanticFeatures?.intentSignals.goal || "unknown"}

CURRENT ASSIGNMENT:
Intent: "${currentIntent.label}" (${currentIntent.pageCount} pages)
Algorithm Confidence: ${Math.round(
    (page.intentAssignments.primary?.confidence || 0) * 100
  )}%
Intent Concepts: ${Object.keys(currentIntent.aggregatedSignals.keywords)
    .slice(0, 10)
    .join(", ")}
Intent Domains: ${currentIntent.aggregatedSignals.domains.join(", ")}

OTHER RECENT INTENTS:
${intentContext || "No other active intents"}

VERIFICATION TASK:
Verify if this assignment is correct. Consider:

1. TOPIC MATCH: Same research topic?
   ✅ "tennis courts Fremont" (Google) + "tennis courts Fremont" (Yelp) = SAME topic
   ❌ "React hooks" vs "Python decorators" = DIFFERENT topics

2. USER JOURNEY: Part of ONE research session?
   ✅ Comparing products across sites = ONE session
   ❌ Work project + personal errands = DIFFERENT sessions

3. MERGE OPPORTUNITY: Should existing intents merge?
   ✅ "Finding tennis courts Fremont" (Google) + "Best tennis courts Fremont" (Yelp) = MERGE
   ✅ "Learning React basics" + "Learning React hooks" = MERGE
   ❌ "Learning Python" + "Learning React" = KEEP SEPARATE

4. SPLIT NEEDED: Is current intent too broad?
   ❌ "Learning programming" mixing Python + React = SPLIT NEEDED

ACTIONS:
- "agree": Assignment correct, no changes
- "merge": Current intent should merge with another (specify which)
- "reassign": Page belongs to different existing intent  
- "split": Current intent too broad, create new for this page

Return ONLY valid JSON:
{
  "action": "agree|merge|reassign|split",
  "confidence": 0.85,
  "reasoning": "One clear sentence explaining decision",
  "suggestedIntentId": "intent-xxx" (only if reassign),
  "intentToMerge": "intent-xxx" (only if merge - intent to remove),
  "mergeInto": "intent-yyy" (only if merge - intent to keep)
}`;

  const session = await LanguageModel.create({
    temperature: 0.3, // Lower temperature for more deterministic decisions
    topK: 2,
  });

  try {
    const response = await session.prompt(prompt);
    const cleaned = cleanJSONResponse(response);
    const parsed = JSON.parse(cleaned);

    return {
      action: parsed.action || "agree",
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || "No reasoning provided",
      suggestedIntentId: parsed.suggestedIntentId,
      intentToMerge: parsed.intentToMerge,
      mergeInto: parsed.mergeInto,
      prompt,
      response,
    };
  } finally {
    session.destroy();
  }
}
