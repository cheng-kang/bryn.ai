import type { PageData } from "@/types/page";
import type { Intent } from "@/types/intent";
import type {
  UserKnowledgeGraph,
  InterestProfile,
  KnowledgeLevel,
  EntityProfile,
} from "@/types/knowledge-graph";
import { storage } from "./storage-manager";

class KnowledgeGraphManager {
  private graph: UserKnowledgeGraph | null = null;
  private initializationError: Error | null = null;

  async initialize(): Promise<void> {
    try {
      const stored = await storage.getKnowledgeGraph();
      this.graph = stored || this.createEmptyGraph();
      this.initializationError = null;
    } catch (error) {
      this.initializationError = error as Error;
      console.error("Knowledge graph initialization failed:", error);
      throw error;
    }
  }

  isAvailable(): boolean {
    return this.graph !== null && this.initializationError === null;
  }

  private createEmptyGraph(): UserKnowledgeGraph {
    return {
      interests: {},
      knowledge: {},
      entities: {
        people: {},
        organizations: {},
        products: {},
        creators: {},
      },
      lastUpdated: Date.now(),
      version: 1,
    };
  }

  async updateFromPage(page: PageData): Promise<void> {
    if (!this.graph) await this.initialize();
    if (!this.graph || this.initializationError) return;

    // Extract interests from page concepts
    if (page.semanticFeatures?.concepts) {
      for (const concept of page.semanticFeatures.concepts.slice(0, 5)) {
        const normalized = concept.toLowerCase();

        if (!this.graph.interests[normalized]) {
          this.graph.interests[normalized] = {
            topic: concept,
            firstSeen: page.timestamp,
            lastSeen: page.timestamp,
            frequency: 1,
            totalDwellTime: page.interactions.dwellTime,
            avgEngagement: page.interactions.engagementScore,
            depth: this.calculateInitialDepth(page),
            relatedTopics: [],
            intentIds: [],
          };
        } else {
          const interest = this.graph.interests[normalized];
          interest.lastSeen = page.timestamp;
          interest.frequency++;
          interest.totalDwellTime += page.interactions.dwellTime;
          interest.avgEngagement =
            (interest.avgEngagement * (interest.frequency - 1) +
              page.interactions.engagementScore) /
            interest.frequency;
          interest.depth = this.calculateDepth(interest);
        }
      }
    }

    // Extract entities
    if (page.semanticFeatures?.entities) {
      const entities = page.semanticFeatures.entities;

      // People
      for (const person of entities.people || []) {
        this.updateEntity("people", person, "person", page);
      }

      // Organizations
      for (const org of entities.organizations || []) {
        this.updateEntity("organizations", org, "organization", page);
      }

      // Products
      for (const product of entities.products || []) {
        this.updateEntity("products", product, "product", page);
      }

      // Creators (from topics that might be creators)
      for (const topic of entities.topics || []) {
        // Heuristic: if topic contains certain patterns, might be a creator
        if (
          topic.toLowerCase().includes("channel") ||
          topic.toLowerCase().includes("youtuber") ||
          topic.toLowerCase().includes("streamer")
        ) {
          this.updateEntity("creators", topic, "creator", page);
        }
      }
    }

    await this.save();
  }

  private updateEntity(
    entityType: "people" | "organizations" | "products" | "creators",
    name: string,
    type: "person" | "organization" | "product" | "creator",
    page: PageData
  ): void {
    if (!this.graph) return;

    const normalized = name.toLowerCase();
    const entityCollection = this.graph.entities[entityType];

    if (!entityCollection[normalized]) {
      entityCollection[normalized] = {
        name,
        type,
        firstSeen: page.timestamp,
        lastSeen: page.timestamp,
        frequency: 1,
        contexts: page.semanticFeatures?.concepts.slice(0, 3) || [],
        relatedIntents: [],
      };
    } else {
      const entity = entityCollection[normalized];
      entity.lastSeen = page.timestamp;
      entity.frequency++;

      // Add new contexts (limit to 10 unique)
      const newContexts = page.semanticFeatures?.concepts || [];
      entity.contexts = [
        ...new Set([...entity.contexts, ...newContexts]),
      ].slice(0, 10);
    }
  }

  async updateFromIntent(intent: Intent): Promise<void> {
    if (!this.graph) await this.initialize();
    if (!this.graph || this.initializationError) return;

    // Add intent label as an interest
    const normalized = intent.label.toLowerCase();

    if (!this.graph.interests[normalized]) {
      this.graph.interests[normalized] = {
        topic: intent.label,
        firstSeen: intent.firstSeen,
        lastSeen: intent.lastUpdated,
        frequency: intent.pageCount,
        totalDwellTime: 0,
        avgEngagement: intent.aggregatedSignals.patterns.avgEngagement,
        depth:
          intent.pageCount >= 6
            ? "deep"
            : intent.pageCount >= 3
            ? "moderate"
            : "shallow",
        relatedTopics: [],
        intentIds: [intent.id],
      };
    } else {
      const interest = this.graph.interests[normalized];
      interest.lastSeen = intent.lastUpdated;
      interest.frequency += intent.pageCount;
      if (!interest.intentIds.includes(intent.id)) {
        interest.intentIds.push(intent.id);
      }
    }

    // Aggregate entities from intent
    const intentEntities = intent.aggregatedSignals.entities;

    // Update entity intent associations
    for (const [entityType, entities] of Object.entries(this.graph.entities)) {
      const intentEntityList =
        intentEntities[entityType as keyof typeof intentEntities] || [];

      for (const entityName of intentEntityList) {
        const normalized = entityName.toLowerCase();
        if (
          entities[normalized] &&
          !entities[normalized].relatedIntents.includes(intent.id)
        ) {
          entities[normalized].relatedIntents.push(intent.id);
        }
      }
    }

    // Infer knowledge level
    this.inferKnowledgeLevel(intent.label, intent);

    await this.save();
  }

  private calculateInitialDepth(
    page: PageData
  ): "shallow" | "moderate" | "deep" {
    const engagement = page.interactions.engagementScore;
    const dwellTime = page.interactions.dwellTime / 1000; // seconds

    if (engagement > 0.7 || dwellTime > 120) return "deep";
    if (engagement > 0.4 || dwellTime > 60) return "moderate";
    return "shallow";
  }

  private calculateDepth(
    profile: InterestProfile
  ): "shallow" | "moderate" | "deep" {
    if (profile.frequency >= 6 || profile.avgEngagement > 0.7) return "deep";
    if (profile.frequency >= 3 || profile.avgEngagement > 0.4)
      return "moderate";
    return "shallow";
  }

  private inferKnowledgeLevel(topic: string, intent: Intent): void {
    if (!this.graph) return;

    const normalized = topic.toLowerCase();

    // Analyze page patterns to infer knowledge level
    let level: "beginner" | "learning" | "proficient" | "expert" = "beginner";
    let confidence = 0.5;

    // Heuristics based on intent characteristics
    const pageCount = intent.pageCount;
    const engagement = intent.aggregatedSignals.patterns.avgEngagement;
    const keywords = Object.keys(intent.aggregatedSignals.keywords);

    // Beginner: tutorial, getting started, intro, basics
    const beginnerKeywords = [
      "tutorial",
      "getting started",
      "intro",
      "basics",
      "beginner",
      "quickstart",
    ];
    const hasBeginnerKeywords = keywords.some((k) =>
      beginnerKeywords.some((bk) => k.toLowerCase().includes(bk))
    );

    // Advanced: best practices, architecture, optimization, advanced
    const advancedKeywords = [
      "architecture",
      "optimization",
      "advanced",
      "best practices",
      "performance",
    ];
    const hasAdvancedKeywords = keywords.some((k) =>
      advancedKeywords.some((ak) => k.toLowerCase().includes(ak))
    );

    if (hasAdvancedKeywords && pageCount >= 10) {
      level = "proficient";
      confidence = 0.7;
    } else if (hasAdvancedKeywords && pageCount >= 5) {
      level = "learning";
      confidence = 0.75;
    } else if (hasBeginnerKeywords && pageCount < 5) {
      level = "beginner";
      confidence = 0.8;
    } else if (pageCount >= 7 && engagement > 0.6) {
      level = "learning";
      confidence = 0.65;
    }

    this.graph.knowledge[normalized] = {
      topic,
      level,
      evidence: intent.pageIds.slice(0, 5), // Top 5 pages as evidence
      confidence,
      lastAssessed: Date.now(),
    };
  }

  getInterestsByRecency(): InterestProfile[] {
    if (!this.graph) return [];

    return Object.values(this.graph.interests)
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, 20);
  }

  getKnowledgeGaps(topic: string): string[] {
    if (!this.graph) return [];

    // Get the interest profile for this topic
    const normalized = topic.toLowerCase();
    const interest = this.graph.interests[normalized];

    if (!interest) return [];

    // Simple implementation: suggest related topics user hasn't explored deeply
    const relatedTopics = Object.values(this.graph.interests)
      .filter(
        (i) =>
          i.topic !== topic &&
          i.depth === "shallow" &&
          i.relatedTopics.some((rt) => rt.toLowerCase().includes(normalized))
      )
      .map((i) => i.topic)
      .slice(0, 5);

    // If no related topics found, suggest common progressions based on topic
    if (relatedTopics.length === 0) {
      return this.suggestCommonProgressions(topic);
    }

    return relatedTopics;
  }

  private suggestCommonProgressions(topic: string): string[] {
    const lower = topic.toLowerCase();

    // Common learning paths
    const progressions: Record<string, string[]> = {
      react: ["React Hooks", "React Context", "React Performance", "Next.js"],
      javascript: [
        "TypeScript",
        "ES6 Features",
        "Async Programming",
        "Node.js",
      ],
      python: ["Python Data Structures", "Python OOP", "Django", "FastAPI"],
      css: ["Flexbox", "Grid Layout", "CSS Animations", "Tailwind CSS"],
    };

    for (const [key, suggestions] of Object.entries(progressions)) {
      if (lower.includes(key)) {
        return suggestions.filter(
          (s) => !this.graph?.interests[s.toLowerCase()]
        );
      }
    }

    return [];
  }

  getMasteredTopics(): KnowledgeLevel[] {
    if (!this.graph) return [];

    return Object.values(this.graph.knowledge)
      .filter((k) => k.level === "proficient" || k.level === "expert")
      .sort((a, b) => b.confidence - a.confidence);
  }

  getFollowedEntities(type?: string): EntityProfile[] {
    if (!this.graph) return [];

    let allEntities: EntityProfile[] = [];

    if (type) {
      // Get specific type
      const entityCollection =
        this.graph.entities[type as keyof typeof this.graph.entities];
      allEntities = Object.values(entityCollection || {});
    } else {
      // Get all entities
      allEntities = [
        ...Object.values(this.graph.entities.people),
        ...Object.values(this.graph.entities.organizations),
        ...Object.values(this.graph.entities.products),
        ...Object.values(this.graph.entities.creators),
      ];
    }

    return allEntities
      .filter((e) => e.frequency >= 3)
      .sort((a, b) => b.frequency - a.frequency);
  }

  private async save(): Promise<void> {
    if (!this.graph) return;

    this.graph.lastUpdated = Date.now();
    await storage.saveKnowledgeGraph(this.graph);
  }

  // For testing/debugging
  getGraph(): UserKnowledgeGraph | null {
    return this.graph;
  }
}

export const knowledgeGraph = new KnowledgeGraphManager();
