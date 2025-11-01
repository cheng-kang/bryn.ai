import type { PageData, SemanticFeatures } from "@/types/page";

// Hybrid embedding: AI features + TF-IDF
export function createEmbedding(page: PageData): number[] {
  const embedding = new Array(256).fill(0);

  if (!page.semanticFeatures) {
    return embedding;
  }

  const features = page.semanticFeatures;

  // Component 1: AI-extracted concepts (40% weight, indices 0-100)
  features.concepts.slice(0, 20).forEach((concept) => {
    const hash = simpleHash(concept);
    const idx = hash % 101;
    embedding[idx] += 0.4 / features.concepts.length;
  });

  // Component 2: AI-extracted entities (20% weight, indices 101-150)
  const allEntities = [
    ...features.entities.people,
    ...features.entities.places,
    ...features.entities.organizations,
    ...features.entities.products,
  ];
  allEntities.slice(0, 10).forEach((entity) => {
    const hash = simpleHash(entity);
    const idx = 101 + (hash % 50);
    embedding[idx] += 0.2 / Math.max(allEntities.length, 1);
  });

  // Component 3: Intent signals (15% weight, indices 151-175)
  const actionHash = simpleHash(features.intentSignals.primaryAction);
  embedding[151 + (actionHash % 25)] +=
    0.15 * features.intentSignals.confidence;

  // Component 4: TF-IDF on content (25% weight, indices 176-255)
  const content = (page.content || page.contentSummary || "").toLowerCase();
  const words = content.split(/\s+/).filter((w) => w.length > 3);
  const termFreq = new Map<string, number>();
  words.forEach((w) => termFreq.set(w, (termFreq.get(w) || 0) + 1));

  const topWords = Array.from(termFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  topWords.forEach(([word, freq]) => {
    const hash = simpleHash(word);
    const idx = 176 + (hash % 80);
    const tf = freq / words.length;
    embedding[idx] += 0.25 * tf;
  });

  // Normalize
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0)
  );
  return magnitude > 0 ? embedding.map((val) => val / magnitude) : embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  return magA > 0 && magB > 0 ? dotProduct / (magA * magB) : 0;
}

export function keywordSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  const setA = new Set(a.map((k) => k.toLowerCase()));
  const setB = new Set(b.map((k) => k.toLowerCase()));

  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

export function entitySimilarity(
  a: SemanticFeatures["entities"],
  b: SemanticFeatures["entities"]
): number {
  const allA = [
    ...a.people,
    ...a.places,
    ...a.organizations,
    ...a.products,
    ...a.topics,
  ].map((e) => e.toLowerCase());

  const allB = [
    ...b.people,
    ...b.places,
    ...b.organizations,
    ...b.products,
    ...b.topics,
  ].map((e) => e.toLowerCase());

  if (allA.length === 0 || allB.length === 0) return 0;

  const setA = new Set(allA);
  const setB = new Set(allB);

  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
