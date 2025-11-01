import type { PageData, SemanticFeatures } from "@/types/page";

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
    } catch (error) {
      this.initialized = false;
      this.initError = error instanceof Error ? error.message : String(error);
      console.error("AIPipeline: ✗ Initialization failed", error);
      throw error;
    }
  }

  /**
   * Get or create LanguageModel session (with reuse for performance)
   * Pattern matches official example: ai.gemini-on-device/sidepanel/index.js lines 19-33
   */
  private async getSession(
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
   * Extract semantic features from page data
   */
  async extractSemanticFeatures(pageData: PageData): Promise<SemanticFeatures> {
    await this.initialize();

    const session = await this.getSession();

    try {
      const content = pageData.contentSummary || pageData.content || "";
      const truncated = content.substring(0, 2000);

      const prompt = `Analyze this web page and extract semantic features.

TITLE: ${pageData.title}
URL: ${pageData.url}
CONTENT: ${truncated}
ENGAGEMENT: ${Math.round(pageData.interactions.engagementScore * 100)}%

Extract and return ONLY valid JSON:
{
  "concepts": ["15 most important keywords"],
  "entities": {
    "people": [],
    "places": [],
    "organizations": [],
    "products": [],
    "topics": []
  },
  "intentSignals": {
    "primaryAction": "researching|shopping|learning|comparing|planning",
    "confidence": 0.85,
    "evidence": ["reason1", "reason2"],
    "goal": "brief user goal"
  },
  "contentType": "article|search|product|video|documentation",
  "sentiment": "informational|transactional|navigational"
}`;

      const response = await session.prompt(prompt);
      const parsed = JSON.parse(response);

      return {
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

      const concepts = topPages
        .flatMap((p) => p.semanticFeatures?.concepts || [])
        .slice(0, 10)
        .join(", ");

      const prompt = `Analyze this browsing session and create a concise intent label.

TOP PAGES:
${pagesDesc}

KEY CONCEPTS: ${concepts}

TOTAL PAGES: ${pages.length}

Create a 4-7 word label starting with an action verb (Learning, Shopping, Researching, Finding, etc.).

Return ONLY valid JSON:
{
  "label": "the intent label",
  "confidence": 0.85,
  "reasoning": "brief explanation"
}`;

      const response = await session.prompt(prompt);
      const parsed = JSON.parse(response);

      return {
        label: parsed.label || topPages[0].title,
        confidence: parsed.confidence || 0.7,
        reasoning: parsed.reasoning || "",
      };
    } catch (error) {
      console.error("AIPipeline: Label generation failed", error);
      throw error;
    }
  }

  /**
   * Summarize page content
   */
  async summarizePage(content: string): Promise<string> {
    await this.initialize();

    const summarizer = await this.getSummarizer();

    try {
      // Truncate to max context size (~4000 chars)
      const truncated = content.substring(0, 4000);
      return await summarizer.summarize(truncated);
    } catch (error) {
      console.error("AIPipeline: Summarization failed", error);
      throw error;
    }
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
