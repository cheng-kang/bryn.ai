## 02 — Architecture & Technical Design

### Design philosophy

Bryn is built on **asynchronous, eventual consistency** to keep the UI responsive while AI runs locally. The system trades immediate completeness for fast feedback and self-healing enrichment.

**Key insight**: Users don't need perfect analysis in 10ms. They need to see their page saved instantly and trust that understanding will arrive soon and improve over time.

---

## System overview

```
User visits page
    ↓
[Content Script] Collect (10ms) → Send to background
    ↓
[Service Worker] Save immediately → UI updates (shows page)
    ↓
[Processing Queue] Enqueue AI tasks (P1: extract semantics, P3: classify behavior)
    ↓
[AI Pipeline] Execute tasks when resources available (~12s for semantics)
    ↓
[Intent Engine] Match page to intent or create new intent
    ↓
[Storage] Persist → Notify UI → UI updates (shows intent, label, summary)
    ↓
[Queue continues] Generate labels, summaries, insights, actions (next 30–60s)
```

**Result**: Page appears in ~20ms. Intent assignment in ~15s. Full enrichment in ~60s.

---

## Core components

### 1. Content Script (Page Tracker)

**What it does**: Lightweight collector injected on every page to extract content and track interactions.

**Key decisions**:

- **Runs at `document_idle`** to avoid blocking page load.
- **Enriches sparse pages**: For pages with <500 chars of text (SPAs, confirmation pages), it adds URL path, meta tags, headings, nav text, and visible links so AI has structural context.
- **Caps content at 50KB** to keep memory usage reasonable and AI prompts focused.

**Interaction tracking**: Measures scroll depth, dwell time, and text selections. These signals feed behavioral classification (e.g., "Deep Reading" vs. "Skimming").

**Why not use Reader Mode API?** Reader Mode isn't exposed to extensions. This heuristic (clone body, strip scripts/styles/iframes, extract text) is fast and effective.

**Code reference**: `src/content-scripts/page-tracker.ts` lines 350–400 (extractContent method).

---

### 2. AI Pipeline

**What it does**: Wrapper for Chrome's built-in AI APIs with session reuse, idle cleanup, and error handling.

**APIs used**:

- **LanguageModel** (Gemini Nano): Semantic extraction, intent reasoning, label/summary generation, knowledge gap synthesis.
- **Summarizer**: Page summarization using "key-points" format and "short" length.
- **LanguageDetector**: Language detection for non-English content.

**Session management**:

- Sessions are expensive to create (~500ms), so they're reused until idle for 5 minutes.
- If parameters change (temperature, topK), the session is destroyed and recreated.
- Cleanup runs every 60 seconds to free memory from idle sessions.

**Why local AI only?**

- **Privacy**: Page content never leaves the device. No telemetry, no cloud.
- **Offline-capable**: Works without internet once the model is downloaded.
- **Cost**: No API fees.

**Trade-off**: Local AI is slower (4–15s per task) than cloud APIs (500ms + network), but privacy is non-negotiable.

**Code reference**: `src/core/ai-pipeline.ts` lines 150–198 (getSession method).

---

### 3. Processing Queue

**What it does**: Priority scheduler with dependency tracking, concurrency limits, and robust retry logic.

**Why a queue?**

- AI tasks are slow. Running them all immediately would block for minutes.
- Dependencies must be respected (e.g., intent matching requires semantic features first).
- Failures need retries without blocking other work.

**Priority design**:

- **Critical (P1–P3)**: Page-level tasks (semantic extraction, behavior classification). Limited to 1 concurrent to avoid memory spikes.
- **Important (P5–P17)**: Intent-level tasks (labels, verification). Up to 2 concurrent.
- **Background (P20–P30)**: Enrichment and periodic tasks (summaries, insights, merge scans). Limited to 1 concurrent.

**Typical task flow**:

1. Page saved → `semantic_extraction` (P1, ~12s)
2. → `classify_behavior` (P3, ~5s)
3. → `intent_matching` (P2, depends on #1, ~500ms)
4. → `generate_intent_label` (P5, ~6s), `generate_intent_summary` (P20, ~8s)

**Dependency example**: Task B can declare `dependencies: [taskA.id]`. The queue builds a graph and unblocks B when A completes.

**Retry logic**: Failed tasks retry with exponential backoff (1s, 2s, 4s, ...). Errors are logged but don't block unrelated work.

**Why not a worker pool?** Service workers have limited lifetime and memory. We use priorities and concurrency limits to avoid resource exhaustion.

**Code reference**: `src/core/processing-queue.ts` lines 372–407 (priority limits and task averages).

---

### 4. Intent Engine

**What it does**: Matches pages to intents using AI-driven semantic similarity plus algorithmic safety nets.

**Why AI-driven matching?**

Rigid rules fail for real-world research:

- **Rule-based**: "Same domain + keyword overlap >50%" → fails for cross-domain research (e.g., comparing laptops on Amazon, Best Buy, Reddit).
- **AI-driven**: Reasons about semantic similarity holistically (e.g., "Sony WH-1000XM5 review" on YouTube matches "noise-canceling headphones" research on Wirecutter).

**Matching algorithm (hybrid)**:

1. **Create hybrid embedding**: Combines AI-extracted concepts (40%), entities (20%), intent signals (15%), and TF-IDF keywords (25%). Results in a 256-dimension vector normalized to unit length.

2. **Score page against recent intents** using weighted signals:

   - **Semantic similarity (30%)**: Cosine similarity of embeddings, weighted by engagement score of intent pages.
   - **Keyword overlap (20%)**: Jaccard similarity of concept sets.
   - **Entity continuity (15%)**: Overlap of people, products, organizations mentioned.
   - **Temporal proximity (15%)**: Exponential decay; recent intents score higher.
   - **Domain continuity (10%)**: Bonus if same domain appears in intent.
   - **Behavioral pattern (10%)**: Similarity of engagement scores.

3. **Threshold decision**: Best match ≥55% confidence → assign. Otherwise → create new intent.

4. **Algorithmic safety net**: Reject merges if domain mismatch is extreme or temporal gap >90 days.

**Why these weights?**

- Semantic similarity (30%) is strongest because it captures cross-domain relationships.
- Temporal proximity (15%) captures "active intent" recency.
- Domain (10%) is lower because related intents often span domains.

**Continuous refresh**: When a page is added to an intent, the engine re-queues enrichment tasks (labels, summaries) at lower priority so the intent's analysis reflects the new context.

**Code reference**: `src/core/intent-engine.ts` lines 135–210 (calculateIntentMatch method).

---

### 5. Semantic Similarity Engine

**Problem**: Chrome has no native embedding API. We can't call `embeddings.create(text)` like with cloud APIs.

**Solution**: Build hybrid embeddings combining AI features (slow but semantic) with TF-IDF (fast but lexical).

**Why hybrid?**

- AI extracts high-level semantics (concepts, entities) but is slow (~12s per page).
- TF-IDF captures keyword-level similarity and is near-instant.
- Combining both gives semantic + lexical matching.

**Embedding structure** (256-dim vector):

- **Indices 0–100**: AI concepts (40% weight). Hash top 20 concepts into bins.
- **Indices 101–150**: AI entities (20% weight). Hash people, organizations, products.
- **Indices 151–175**: Intent signals (15% weight). Hash primary action with confidence weighting.
- **Indices 176–255**: TF-IDF keywords (25% weight). Hash top 20 words by term frequency.
- **Normalize**: L2 normalization ensures cosine similarity works correctly.

**Similarity**: Cosine similarity between normalized vectors. <1ms per comparison.

**Why not use AI for every comparison?** Too slow. Matching one page against 30 intents would take 30 × 12s = 6 minutes. Embeddings make it <30ms total.

**Code reference**: `src/core/semantic-similarity.ts` lines 3–79 (createEmbedding and cosineSimilarity functions).

---

### 6. Storage Manager

**What it does**: IndexedDB abstraction with atomic operations, duplicate detection, and UI notifications.

**Key object stores**:

- **pages**: Indexed by `id`, `url`, `timestamp`, and `intentAssignments.primary.intentId` for fast lookups.
- **intents**: Indexed by `id`, `status`, `lastUpdated`, `firstSeen`.
- **nudges**: Indexed by `id`, `intentId`, `status`, `priority`.
- **processingQueue**: Indexed by `id`, `status`, `priority`, `createdAt`.
- **settings**, **knowledgeGraph**, **activitySummaries**: Single-record stores.

**Duplicate detection**: If a page with the same URL was saved within the last 30 seconds, merge the data instead of creating a duplicate. This handles SPA navigation and fast reloads.

**UI reactivity**: Emits events (`page-added`, `page-updated`, `intent-updated`) so the UI re-renders immediately with the best available data. Background enrichment updates the same records; UI auto-refreshes.

**Why IndexedDB?** It's the only persistent storage option in extensions with unlimited capacity. `chrome.storage.local` has a 10MB quota.

**Code reference**: `src/core/storage-manager.ts` lines 28–103 (schema definition), lines 106–135 (savePage with deduplication).

---

### 7. Proactive Suggestion Engine (Nudge Generator)

**What it does**: Background job that creates actionable suggestions based on intent state and knowledge analysis.

**Triggers and logic**:

- **Dormant intent** (no activity 7+ days): "Ready to pick up your React hooks reading?"
- **Merge opportunities**: AI detects related intents and suggests combining them.
- **Knowledge gaps** (via `ai_analyze_knowledge_gaps` task): Synthesizes next logical research step. Example: User researched "React Hooks" and "State Management" but not "Context API" → suggest Context API.
- **Milestone prediction** (via `ai_predict_milestone` task): Infers completion (e.g., order confirmation page → mark intent Completed).
- **Intent refresh**: When a page is added to an intent, old nudges are pruned and new ones generated.

**Rate limiting**: Max 3 active nudges at a time to avoid overwhelming the user.

**Why AI-driven synthesis?**

Simple reminders ("You haven't visited this in a week") aren't actionable. AI can reason about what's missing and suggest concrete next steps based on the knowledge graph.

**Code reference**: `src/services/nudge-generator.ts` lines 15–109 (generateNudges method with rules).

---

## Data flow (detailed)

### Flow 1: Fast path (instant feedback)

1. User visits page → Content script extracts data (~10ms).
2. Sends message to service worker.
3. Service worker saves to IndexedDB (~10ms).
4. Storage emits `page-added` event → UI renders page card.
5. **Total: ~20ms**. User sees feedback instantly.

### Flow 2: Background processing (eventual enrichment)

1. Service worker enqueues:
   - `semantic_extraction` (P1, ~12s)
   - `classify_behavior` (P3, ~5s)
   - `summarization` (P4, ~4s, if content >5KB)
2. Queue processes P1 → AI extracts concepts, entities, intent signals.
3. On P1 completion → auto-enqueue `intent_matching` (P2, depends on P1).
4. Intent matching assigns page → triggers enrichment:
   - `generate_intent_label` (P5, ~6s)
   - `generate_intent_summary` (P20, ~8s)
5. **Total: ~30–60s**. UI updates as each task completes.

### Flow 3: Continuous refresh

1. User visits Page 5 related to existing "React Hooks" intent.
2. Flow 2 completes → Page 5 assigned to intent.
3. Intent Engine detects change → re-queues label/summary tasks at lower priority (P15, P25).
4. Within ~1 minute, intent's label/summary refreshes to include Page 5's insights.

### Flow 4: Graceful failure

1. `summarization` task fails (e.g., AI session crash).
2. Queue catches error, logs attempt, re-queues with backoff (1s, then 2s, then 4s...).
3. Other tasks continue normally.
4. Summarization retries and succeeds on second attempt.
5. **Result**: User unaffected. Eventual consistency achieved.

---

## Key design decisions

### 1. Async queue architecture

**Decision**: Use a priority queue with dependency tracking instead of running all AI tasks immediately.

**Why**: AI tasks are slow (4–15s each). Running them all immediately would block for minutes and spike memory usage.

**Trade-off**: Added complexity (dependency graphs, retries) but essential for responsive UI.

**Reference**: Product doc section 5.2.3 emphasizes robust retry logic and graceful failure handling.

---

### 2. AI-native matching (not rule-based)

**Decision**: Use AI reasoning + hybrid embeddings for intent matching instead of rigid algorithmic rules.

**Why**: Rule-based matching ("same domain + 50% keyword overlap") fails for:

- Cross-domain research (comparing products on Amazon vs. Best Buy).
- Sparse content (order confirmations, SPA pages).

**Trade-off**: AI is slower and less predictable, but far more accurate for real-world browsing patterns.

**Reference**: Product doc section 5.2.4 describes AI-driven matching as the "core decision-maker."

---

### 3. Hybrid embeddings (AI + TF-IDF)

**Decision**: Build custom embeddings from AI features + TF-IDF instead of waiting for a native embedding API.

**Why**: Chrome has no embedding API. Calling AI for every similarity comparison (30 intents × 12s = 6 minutes) is too slow.

**Trade-off**: Embeddings are approximate (hash collisions possible) but enable <1ms similarity checks.

**Reference**: Product doc section 5.2.5 specifies the exact weighting (40% concepts, 20% entities, 15% signals, 25% TF-IDF).

---

### 4. On-device AI only (no cloud)

**Decision**: Use Chrome's built-in Gemini Nano exclusively. No cloud API calls.

**Why**: Privacy is a core principle. Users trust Bryn because nothing leaves their device.

**Trade-off**: Slower than cloud APIs (4–15s vs. 500ms), requires Chrome 138+, English-first quality.

**Reference**: Product doc Principle #4 (Privacy & Transparency) mandates on-device processing with zero external API calls.

---

### 5. Eventual consistency (not immediate)

**Decision**: Show "best available" data immediately; enrich in the background.

**Why**: Immediate consistency would require blocking for 30–60s per page. Users would abandon the extension.

**Trade-off**: UI shows incomplete data briefly, but responsiveness is preserved.

**Reference**: Product doc Principle #5 (Robust & Dynamic) describes the system as "designed for eventual consistency."

---

### 6. Continuous refresh (not write-once)

**Decision**: Re-analyze intents when new pages are added, not just on creation.

**Why**: Intents evolve. Adding a 5th page might completely change the meaning of a 4-page intent.

**Trade-off**: More queue load, but intents stay accurate as context grows.

**Reference**: Product doc section 5.2.4 (Continuous Refresh) requires automatic re-queueing to keep analysis up-to-date.

---

## Performance characteristics

**Memory**:

- Service Worker: ~20–50MB (including AI sessions).
- Side Panel: ~15–30MB.
- Storage: ~10KB per page (compressed). 1000 pages ≈ 10MB.

**Latency**:

- Page save: ~10ms.
- Semantic extraction: ~12s (AI).
- Intent matching: ~500ms (algorithmic + embeddings).
- Label generation: ~6s (AI).

**Concurrency**: Max 2 AI sessions at once to avoid memory spikes.

**Persistence**: Queue state is persisted to IndexedDB. On extension reload, pending tasks resume.

---

## Extension structure

**Manifest**: MV3 with service worker, side panel, and content scripts.

**Background**: Service worker handles messages, initializes AI, manages queue, and schedules periodic tasks via `chrome.alarms`.

**Content scripts**: Injected on `<all_urls>` at `document_idle`. Skips `chrome://` and `extension://` pages.

**Side panel**: React app with routing, real-time updates via storage events, and developer tools.

**Build**: Vite + @crxjs/vite-plugin for HMR and bundling to `dist/`.

**Code reference**: `public/manifest.json`, `src/background/service-worker.ts` lines 1–60 (initialization).
