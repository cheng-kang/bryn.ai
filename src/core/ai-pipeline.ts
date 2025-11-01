import type {
  PageData,
  SemanticFeatures,
  BehavioralClassification,
  UserBehavior,
} from "@/types/page";

/**
 * Clean AI response to extract JSON
 * Handles markdown code blocks and other formatting
 */
function cleanJSONResponse(response: string): string {
  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  let cleaned = response.trim();

  // Remove ```json or ``` at start
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");

  // Remove ``` at end
  cleaned = cleaned.replace(/\s*```\s*$/, "");

  // Find JSON object/array
  const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return cleaned.trim();
}

// Following official Chrome extension examples - using LanguageModel directly as global
class AIPipeline {
  // Session instances (reused for performance)
  private session: LanguageModelSession | null = null;
  private summarizer: SummarizerSession | null = null;
  private languageDetector: LanguageDetectorSession | null = null;

  // Track session config to detect changes
  private sessionParams: LanguageModelCreateOptions | null = null;

  // Initialization state
  private initialized = false;
  private initError: string | null = null;

  // Resource management
  private sessionLastUsed = 0;
  private sessionTimeout = 5 * 60 * 1000; // 5 minutes
  private cleanupTimer: NodeJS.Timeout | null = null;

  /**
   * Initialize and check availability of Chrome AI APIs
   * Pattern matches official examples: ai.gemini-on-device, ai.gemini-on-device-calendar-mate
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log("AIPipeline: Starting initialization...");

      // Check if LanguageModel is available (from official examples)
      // Reference: ai.gemini-on-device/sidepanel/index.js line 45
      if (!("LanguageModel" in self)) {
        this.initError =
          "Chrome AI APIs not available. Please ensure:\n" +
          "1. Chrome 138+ is installed\n" +
          "2. AI features are enabled in chrome://flags\n" +
          "3. Gemini Nano model is downloaded (check chrome://components)";
        console.warn("AIPipeline:", this.initError);
        throw new Error(this.initError);
      }

      console.log("AIPipeline: Checking LanguageModel availability...");
      // Direct usage like official examples - no wrapper needed
      const lmAvailability = await LanguageModel.availability();
      console.log("AIPipeline: LanguageModel availability:", lmAvailability);

      if (lmAvailability === "unavailable") {
        this.initError =
          "Prompt API not available. Chrome AI may not be supported on this device.";
        throw new Error(this.initError);
      }

      if (lmAvailability === "after-download") {
        this.initError =
          "Gemini Nano model is downloading. Please wait and reload the extension after download completes.";
        throw new Error(this.initError);
      }

      // Check Summarizer availability
      if ("Summarizer" in self) {
        const sumAvailability = await Summarizer.availability();
        console.log("Summarizer availability:", sumAvailability);

        if (sumAvailability === "unavailable") {
          console.warn(
            "Summarizer not available - summarization features disabled"
          );
        }
      } else {
        console.warn("Summarizer API not found in this Chrome version");
      }

      // Check LanguageDetector availability
      if ("LanguageDetector" in self) {
        const ldAvailability = await LanguageDetector.availability();
        console.log("LanguageDetector availability:", ldAvailability);

        if (ldAvailability === "unavailable") {
          console.warn(
            "LanguageDetector not available - language detection disabled"
          );
        }
      } else {
        console.warn("LanguageDetector API not found in this Chrome version");
      }

      this.initialized = true;
      this.initError = null;
      console.log("AIPipeline: ✓ Chrome AI APIs available");

      // Start session cleanup timer
      this.startCleanupTimer();
    } catch (error) {
      this.initialized = false;
      this.initError = error instanceof Error ? error.message : String(error);
      console.error("AIPipeline: ✗ Initialization failed", error);
      throw error;
    }
  }

  /**
   * Start periodic cleanup of idle sessions
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();

      // Cleanup main session if idle
      if (this.session && now - this.sessionLastUsed > this.sessionTimeout) {
        console.log("AIPipeline: Destroying idle LanguageModel session");
        this.session.destroy();
        this.session = null;
        this.sessionParams = null;
      }
    }, 60000); // Check every minute
  }

  /**
   * Get or create LanguageModel session (with reuse for performance)
   * Pattern matches official example: ai.gemini-on-device/sidepanel/index.js lines 19-33
   */
  async getSession(
    params?: LanguageModelCreateOptions
  ): Promise<LanguageModelSession> {
    // If params changed, destroy old session and create new one
    if (
      this.session &&
      params &&
      JSON.stringify(params) !== JSON.stringify(this.sessionParams)
    ) {
      console.log("AIPipeline: Session params changed, recreating session");
      this.session.destroy();
      this.session = null;
    }

    // Create new session if needed
    if (!this.session) {
      const defaultParams: LanguageModelCreateOptions = {
        initialPrompts: [
          {
            role: "system",
            content:
              "You are an AI assistant that analyzes browsing behavior. Always return valid JSON when requested. Be concise and accurate.",
          },
        ],
        temperature: 0.7,
        topK: 3,
      };

      this.sessionParams = params || defaultParams;

      // Direct usage like official examples
      this.session = await LanguageModel.create(this.sessionParams);
      console.log("AIPipeline: ✓ LanguageModel session created");
    }

    // TypeScript guard
    if (!this.session) {
      throw new Error("Failed to create LanguageModel session");
    }

    // Track session usage for timeout cleanup
    this.sessionLastUsed = Date.now();

    return this.session;
  }

  /**
   * Get or create Summarizer session (with reuse)
   */
  private async getSummarizer(): Promise<SummarizerSession> {
    if (!this.summarizer) {
      const availability = await Summarizer.availability();

      if (availability === "unavailable") {
        throw new Error("Summarizer not available");
      }

      // Create summarizer
      const summarizer = await Summarizer.create({
        type: "key-points",
        format: "plain-text",
        length: "short",
        sharedContext: "This is a web page",
      });

      // Handle download if needed
      if (availability === "after-download") {
        if (summarizer.addEventListener) {
          summarizer.addEventListener("downloadprogress", (e: any) => {
            console.log(`Summarizer downloading: ${e.loaded * 100}%`);
          });
        }
        if (summarizer.ready) {
          await summarizer.ready;
        }
      }

      this.summarizer = summarizer;
      console.log("AIPipeline: ✓ Summarizer created");
    }

    // TypeScript guard
    if (!this.summarizer) {
      throw new Error("Failed to create Summarizer session");
    }

    return this.summarizer;
  }

  /**
   * Get or create LanguageDetector session (with reuse)
   */
  private async getLanguageDetector(): Promise<LanguageDetectorSession> {
    if (!this.languageDetector) {
      const availability = await LanguageDetector.availability();

      if (availability === "unavailable") {
        throw new Error("LanguageDetector not available");
      }

      this.languageDetector = await LanguageDetector.create();

      // Handle download if needed
      if (availability === "after-download") {
        console.log("LanguageDetector: Model downloading...");
      }

      console.log("AIPipeline: ✓ LanguageDetector created");
    }

    // TypeScript guard
    if (!this.languageDetector) {
      throw new Error("Failed to create LanguageDetector session");
    }

    return this.languageDetector;
  }

  /**
   * Check if AI pipeline is ready
   */
  isAvailable(): boolean {
    return this.initialized;
  }

  /**
   * Get initialization error if any
   */
  getInitError(): string | null {
    return this.initError;
  }

  /**
   * Extract semantic features from page data with debug info
   */
  async extractSemanticFeaturesWithDebug(pageData: PageData): Promise<{
    features: SemanticFeatures;
    debug: { prompt: string; response: string };
  }> {
    await this.initialize();

    const session = await this.getSession();

    try {
      const content = pageData.contentSummary || pageData.content || "";
      const truncated = content.substring(0, 2000);

      const prompt = `Analyze this web page and extract semantic features.

IMPORTANT: Pages vary in data quality. Even error pages (404s) contain valuable intent signals.
- Full content: Deep analysis from content
- Error pages: Infer intent from URL, domain, meta tags
- Minimal content: Use title, metadata, URL patterns
- Always explain reasoning in evidence array

PAGE DATA:
TITLE: ${pageData.title}
URL: ${pageData.url}
DOMAIN: ${pageData.metadata.domain}
IS_ERROR_PAGE: ${
        pageData.metadata.titleContains404 ||
        pageData.metadata.titleContainsError
          ? "yes - but still analyze"
          : "no"
      }
CONTENT_LENGTH: ${pageData.metadata.bodyTextLength} characters
CONTENT: ${truncated}

METADATA:
- Description: ${pageData.metadata.description || "none"}
- Keywords: ${pageData.metadata.keywords || "none"}
- OG Title: ${pageData.metadata.ogTitle || "none"}
- Headings: ${pageData.metadata.headingCount}
- Links: ${pageData.metadata.linkCount}

USER ENGAGEMENT:
- Engagement Score: ${Math.round(pageData.interactions.engagementScore * 100)}%
- Scroll Depth: ${pageData.interactions.scrollDepth}%
- Dwell Time: ${Math.round(pageData.interactions.dwellTime / 1000)}s
- Text Selections: ${pageData.interactions.textSelections.length}

ANALYSIS INSTRUCTIONS:
1. Extract intent even from sparse/error pages (URL + domain = strong signals)
2. Lower confidence for error pages, but still identify intent
3. Be specific in concepts (actual keywords from content/metadata)
4. Explain your reasoning in evidence array
5. If error page: Note it but identify what user was trying to find

Extract and return ONLY valid JSON:
{
  "concepts": ["specific keywords from content/metadata, not generic"],
  "entities": {
    "people": [],
    "places": [],
    "organizations": [],
    "products": [],
    "topics": []
  },
  "intentSignals": {
    "primaryAction": "researching|shopping|learning|comparing|planning|navigating",
    "confidence": 0.65,
    "evidence": [
      "URL contains 'tennis-101' suggesting instructional content",
      "Domain is USTA (tennis organization)",
      "Error page but clear tennis-related intent from URL/domain"
    ],
    "goal": "specific user goal inferred from all signals"
  },
  "contentType": "article|search|product|video|documentation|error|redirect",
  "sentiment": "informational|transactional|navigational"
}`;

      const response = await session.prompt(prompt);

      // Clean response to handle markdown code blocks
      const cleaned = cleanJSONResponse(response);
      const parsed = JSON.parse(cleaned);

      const features = {
        concepts: parsed.concepts || [],
        entities: parsed.entities || {
          people: [],
          places: [],
          organizations: [],
          products: [],
          topics: [],
        },
        intentSignals: parsed.intentSignals || {
          primaryAction: "browsing",
          confidence: 0.5,
          evidence: [],
          goal: "",
        },
        contentType: parsed.contentType || "article",
        sentiment: parsed.sentiment || "informational",
      };

      return {
        features,
        debug: { prompt, response },
      };
    } catch (error) {
      console.error("AIPipeline: Feature extraction failed", error);
      // Reset session on error
      if (this.session) {
        this.session.destroy();
        this.session = null;
        this.sessionParams = null;
      }
      throw error;
    }
  }

  /**
   * Extract semantic features (wrapper without debug info)
   */
  async extractSemanticFeatures(pageData: PageData): Promise<SemanticFeatures> {
    const result = await this.extractSemanticFeaturesWithDebug(pageData);
    return result.features;
  }

  /**
   * Generate intent label from browsing session
   */
  async generateIntentLabel(
    pages: PageData[]
  ): Promise<{ label: string; confidence: number; reasoning: string }> {
    await this.initialize();

    if (pages.length === 0) {
      throw new Error("No pages provided for label generation");
    }

    const session = await this.getSession();

    try {
      const topPages = pages
        .sort(
          (a, b) =>
            b.interactions.engagementScore - a.interactions.engagementScore
        )
        .slice(0, 5);

      const pagesDesc = topPages
        .map(
          (p, i) =>
            `${i + 1}. "${p.title}" | ${Math.round(
              p.interactions.engagementScore * 100
            )}% engaged`
        )
        .join("\n");

      const topKeywords = topPages
        .flatMap((p) => p.semanticFeatures?.concepts || [])
        .slice(0, 10)
        .join(", ");

      const domains = [...new Set(topPages.map((p) => p.metadata.domain))].join(
        ", "
      );

      const primaryActions = topPages
        .map((p) => p.semanticFeatures?.intentSignals.primaryAction)
        .filter(Boolean);
      const mostCommonAction = primaryActions[0] || "exploring";

      // Build list of forbidden labels (page titles)
      const forbiddenLabels = pages.map((p) => `"${p.title}"`).join(", ");

      const prompt = `Create a concise, descriptive intent label for this browsing session:

PAGES (${pages.length} total):
${pagesDesc}

KEY TOPICS: ${topKeywords}
DOMAINS: ${domains}
PRIMARY ACTION: ${mostCommonAction}

❌ FORBIDDEN (DO NOT USE THESE - they are page titles):
${forbiddenLabels}

CRITICAL RULES:
1. Start with action verb: Learning, Exploring, Finding, Researching, Shopping, Comparing, Investigating
2. Include SPECIFIC topic from keywords (NOT domain/site names)
3. 3-6 words maximum
4. NEVER copy page titles, search queries, or website names
5. NO special characters: –, —, |, "Best", "Top", "Official"
6. Extract the INTENT behind the browsing, not the page titles

GOOD EXAMPLES:
✅ "Learning React Hooks Patterns" (action verb + specific tech + concept)
✅ "Finding Tennis Courts in Fremont" (action + specific place/activity)
✅ "Researching Python Data Structures" (action + language + topic)
✅ "Comparing Electric Vehicles Features" (action + product + aspect)

BAD EXAMPLES (REJECT THESE):
❌ "Quick Start – React" (copied from page title, has "–")
❌ "tennis courts near fremont ca - Google Search" (search query, has "- Google")
❌ "TOP 10 BEST Tennis Courts in Fremont, CA - Updated 2025" (page title, has "TOP", "Best")
❌ "React Documentation" (too generic, missing action verb)
❌ "Exploring Information" (no specific topic)

If the label you generate matches ANY of the forbidden examples, TRY AGAIN with different wording!

Return ONLY valid JSON:
{
  "label": "Action Verb + Specific Topic (3-6 words)",
  "confidence": 0.8,
  "reasoning": "Why this label captures user intent"
}`;

      const response = await session.prompt(prompt);

      // Clean response to handle markdown code blocks
      const cleaned = cleanJSONResponse(response);
      const parsed = JSON.parse(cleaned);

      return {
        label: parsed.label || `Exploring ${topKeywords.split(",")[0]}`,
        confidence: parsed.confidence || 0.7,
        reasoning: parsed.reasoning || "Based on browsing pattern",
      };
    } catch (error) {
      console.error("AIPipeline: Label generation failed", error);
      throw error;
    }
  }

  /**
   * Summarize page content with debug info
   */
  async summarizePageWithDebug(content: string): Promise<{
    summary: string;
    debug: { inputLength: number; outputLength: number };
  }> {
    await this.initialize();

    const summarizer = await this.getSummarizer();

    try {
      // Truncate to max context size (~4000 chars)
      const truncated = content.substring(0, 4000);
      const summary = await summarizer.summarize(truncated);

      return {
        summary,
        debug: {
          inputLength: truncated.length,
          outputLength: summary.length,
        },
      };
    } catch (error) {
      console.error("AIPipeline: Summarization failed", error);
      throw error;
    }
  }

  /**
   * Summarize page content (wrapper without debug info)
   */
  async summarizePage(content: string): Promise<string> {
    const result = await this.summarizePageWithDebug(content);
    return result.summary;
  }

  /**
   * Classify user behavior on page based on interaction patterns
   */
  async classifyBehavior(page: PageData): Promise<BehavioralClassification> {
    await this.initialize();
    const session = await this.getSession();

    const prompt = `Classify the user's behavior on this web page based on interaction patterns.

PAGE INFO:
- Title: ${page.title}
- URL: ${page.url}
- Domain: ${page.metadata.domain}
- Content Type: ${page.semanticFeatures?.contentType || "unknown"}

INTERACTION SIGNALS:
- Dwell Time: ${Math.round(page.interactions.dwellTime / 1000)}s
- Scroll Depth: ${page.interactions.scrollDepth}%
- Total Scroll Distance: ${page.interactions.totalScrollDistance}px
- Text Selections: ${page.interactions.textSelections.length}
- Engagement Score: ${Math.round(page.interactions.engagementScore * 100)}%

BEHAVIOR TYPES:
- deep_reading: High dwell time (>60s), high scroll depth (>70%), multiple text selections
- skimming: Moderate dwell (20-60s), high scroll speed, few/no selections
- watching_video: Video-related URL/title, high dwell, low scroll
- form_filling: Form-related page, moderate dwell, low scroll depth
- comparing_items: Multiple similar pages, shopping context, medium engagement
- searching: Search result page, low dwell (<20s), high scroll
- navigating: Very low dwell (<10s), minimal scroll, no selections

Analyze the signals and return ONLY valid JSON:
{
  "primaryBehavior": "deep_reading|skimming|watching_video|form_filling|comparing_items|searching|navigating",
  "confidence": 0.85,
  "evidence": [
    "High dwell time (95s) indicates focused reading",
    "3 text selections suggest active engagement",
    "85% scroll depth shows thorough consumption"
  ]
}`;

    try {
      const response = await session.prompt(prompt);
      const cleaned = cleanJSONResponse(response);
      const parsed = JSON.parse(cleaned);

      return {
        primaryBehavior: parsed.primaryBehavior || "navigating",
        confidence: parsed.confidence || 0.5,
        evidence: parsed.evidence || [],
        classifiedAt: Date.now(),
      };
    } catch (error) {
      console.error("AIPipeline: Behavior classification failed", error);
      // Fallback to heuristic classification
      return this.heuristicBehaviorClassification(page);
    }
  }

  /**
   * Fallback heuristic behavior classification when AI fails
   */
  private heuristicBehaviorClassification(
    page: PageData
  ): BehavioralClassification {
    const dwellTime = page.interactions.dwellTime / 1000; // seconds
    const scrollDepth = page.interactions.scrollDepth;
    const textSelections = page.interactions.textSelections.length;
    const engagement = page.interactions.engagementScore;

    let primaryBehavior: UserBehavior = "navigating";
    let confidence = 0.6;
    const evidence: string[] = [];

    // Deep reading
    if (dwellTime > 60 && scrollDepth > 70 && textSelections > 0) {
      primaryBehavior = "deep_reading";
      confidence = 0.8;
      evidence.push(
        `High dwell time (${dwellTime.toFixed(0)}s)`,
        `Deep scroll (${scrollDepth}%)`,
        `${textSelections} text selections`
      );
    }
    // Watching video
    else if (
      dwellTime > 60 &&
      scrollDepth < 30 &&
      (page.url.includes("youtube") || page.url.includes("video"))
    ) {
      primaryBehavior = "watching_video";
      confidence = 0.75;
      evidence.push(
        `Long dwell time on video site`,
        `Low scroll (${scrollDepth}%)`
      );
    }
    // Skimming
    else if (dwellTime >= 20 && dwellTime <= 60 && scrollDepth > 50) {
      primaryBehavior = "skimming";
      confidence = 0.7;
      evidence.push(
        `Moderate dwell time (${dwellTime.toFixed(0)}s)`,
        `High scroll (${scrollDepth}%)`
      );
    }
    // Searching
    else if (
      dwellTime < 20 &&
      (page.url.includes("google.com/search") || page.url.includes("search"))
    ) {
      primaryBehavior = "searching";
      confidence = 0.85;
      evidence.push("Search page with quick scan");
    }
    // Form filling
    else if (
      page.title.toLowerCase().includes("checkout") ||
      page.title.toLowerCase().includes("form") ||
      page.url.includes("/checkout")
    ) {
      primaryBehavior = "form_filling";
      confidence = 0.7;
      evidence.push("Checkout or form page detected");
    }
    // Navigating (default)
    else {
      evidence.push(
        `Brief visit (${dwellTime.toFixed(0)}s)`,
        `Low engagement (${Math.round(engagement * 100)}%)`
      );
    }

    return {
      primaryBehavior,
      confidence,
      evidence,
      classifiedAt: Date.now(),
    };
  }

  /**
   * Detect language of text
   */
  async detectLanguage(
    text: string
  ): Promise<{ detectedLanguage: string; confidence: number }> {
    await this.initialize();

    const detector = await this.getLanguageDetector();

    try {
      const results = await detector.detect(text);
      return results[0] || { detectedLanguage: "en", confidence: 0.5 };
    } catch (error) {
      console.error("AIPipeline: Language detection failed", error);
      throw error;
    }
  }

  /**
   * Clean up all sessions and free resources
   * Call this when parameters change or on extension unload
   */
  destroy(): void {
    if (this.session) {
      this.session.destroy();
      this.session = null;
      this.sessionParams = null;
    }
    if (this.summarizer) {
      this.summarizer.destroy();
      this.summarizer = null;
    }
    if (this.languageDetector) {
      this.languageDetector.destroy();
      this.languageDetector = null;
    }
    console.log("AIPipeline: All sessions destroyed");
  }
}

export const aiPipeline = new AIPipeline();
