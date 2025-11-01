## 01 — Product

### Vision

Bryn AI helps you remember the **why** behind your browsing. It organizes related activity into "Intents" and proactively suggests meaningful next steps, reducing cognitive load and helping you resume, complete, or explore with less friction.

**The problem**: Browsers remember _what_ you visit, but never _why_. Research fragments across tabs and days, and traditional history lists are useless for piecing context back together.

**The solution**: Bryn understands intention, groups related pages automatically, and acts as a thoughtful partner—not just a logger.

---

## Target audience

- **Knowledge workers**: Researchers, developers, analysts, and marketers who live in the browser and manage multiple complex projects.
- **Students and academics**: Anyone conducting long-term, multi-session research.
- **Power users**: Users overwhelmed by browsing habits who want an automated system to organize the chaos.

---

## Core principles

### 1. Human-first AI

The assistant must be a thoughtful partner, not a robotic task manager.

**Good examples** (from product doc):

- "Ready to pick up your React hooks reading?"
- "Still comparing the Sony X1 and Bose Y2? Want to pull up that head-to-head review?"

**Bad examples**:

- "Task 'Article X' is 70% complete. Click to continue."
- "You have visited YouTube 5 times. Suggestion: watch a new video."

**What this means in practice**:

- Suggestions read like a colleague, not metrics.
- Labels are human-readable ("Researching noise-canceling headphones" not "Intent #47").
- You can edit any analysis, mark intents completed, and see reasoning ("Why am I seeing this?").

---

### 2. Asynchronous & eventual

The extension never slows you down. Heavy work happens in the background.

**Architecture**: Collect (instant) → Queue (background) → Analyze (eventual).

**User experience**:

- Page appears in the UI within 20ms.
- Intent assignment appears within 15 seconds.
- Full enrichment (labels, summaries, insights) arrives within 60 seconds.
- The UI always shows the "best available" data and improves as tasks complete.

---

### 3. Action over administration

The main interface focuses on **acting**, not organizing.

**What you see**:

- Suggested actions (resume, explore, complete).
- Recent activity summary.
- Simple intent cards with context.

**What you don't see** (unless you ask):

- Raw intent lists.
- Processing queue status.
- Internal metadata.

The complexity of "intents" is a background process. The foreground is dedicated to actionable suggestions and simple reminders.

---

### 4. Privacy & transparency

All data is processed locally. You're in control.

**Guarantees**:

- **On-device processing**: All AI runs locally (Chrome's Gemini Nano). Zero external API calls. No telemetry.
- **Local data storage**: Everything lives in your browser's IndexedDB. No cloud sync. Data is cleared when you uninstall.
- **User control**: Edit insights, export data, delete everything. Every suggestion has an "Explain why I'm seeing this" link.
- **Content access**: Only processes pages you visit. Respects browser permissions. Ignores `chrome://` and `extension://` pages.

---

## Key user flows

### 1. Proactive Discovery (Knowledge Gap)

**Scenario**: Over a week, you research "React Hooks" and "React State Management."

**What happens**:

1. The Knowledge Graph learns your interests and knowledge level.
2. A periodic AI task (`ai_analyze_knowledge_gaps`) runs.
3. AI prompt: "User knows React Hooks and State Management but hasn't researched Context API or Zustand, which connect these topics. Suggest a next step."
4. **Result**: A new suggested action appears: "Saw you're digging into React state. A lot of people find Zustand a simpler way to manage it. Want to check it out?"

**Why this matters**: Simple reminders aren't actionable. AI synthesizes what you _should_ explore next based on gaps in your knowledge.

---

### 2. Smart Completion (Task Closure)

**Scenario**: You spend two days browsing laptops on Amazon, Best Buy, and review sites.

**What happens**:

1. AI creates an Active Intent: "Researching New Laptop."
2. You visit a checkout page, fill in a form (detected as "Form Filling").
3. You land on an order confirmation page.
4. AI task (`ai_predict_milestone`) sees "Thank you for your order" and transitions the intent from Active to Completed.
5. **Result**: The "New Laptop" intent and all its suggestions are removed from the main dashboard, reducing clutter.

**Why this matters**: Bryn detects closure signals automatically so you don't have to manually clean up.

---

### 3. Resume in Context

**Scenario**: You were reading a long article about React performance but got interrupted.

**What happens**:

1. When you return hours or days later, Bryn shows: "Looked like you were in the middle of that 'React Hooks Performance' article. Want to jump back in?"
2. Clicking opens the article at the last scroll position (if interaction data was captured).

**Why this matters**: Bryn remembers where you left off and makes it easy to resume momentum.

---

### 4. Merge Opportunities

**Scenario**: You have two intents, "Noise-canceling headphones" and "Sony WH-1000XM5 research," which are clearly related.

**What happens**:

1. AI task (`scan_intent_merge_opportunities`) detects high similarity.
2. Bryn suggests: "Looks like 'Noise-canceling headphones' and 'Sony WH-1000XM5 research' are related. Merge them?"
3. You can merge or keep separate with a short rationale.

**Why this matters**: Bryn helps you consolidate fragmented research without forcing automatic merges (which might be wrong).

---

### 5. Refresh Cadence

**Scenario**: You add a 5th page to an existing 4-page intent.

**What happens**:

1. The new page is assigned to the intent.
2. Intent Engine detects the change and re-queues enrichment tasks (labels, summaries, insights) at lower priority.
3. Within ~1 minute, the intent's label updates to reflect the broader context.

**Why this matters**: Intents stay accurate as your research evolves. The label "Comparing headphones" might become "Comparing Sony vs. Bose headphones" after you add reviews.

---

## What Bryn is (and isn't)

### Is

- A browsing companion that understands intention and helps you continue momentum.
- A proactive assistant that suggests next steps based on context and knowledge gaps.
- A privacy-first tool that runs 100% locally.

### Isn't

- A basic history list or tab manager.
- A manual to-do tracker (you don't create intents; Bryn does).
- A productivity enforcer (no timers, blockers, or guilt trips).

---

## Current limitations

- **Chrome-only**: Requires Chrome 138+ with built-in AI (Gemini Nano) available.
- **English-first**: AI quality varies for other languages.
- **Resource-sensitive**: AI sessions can be memory-intensive on low-end devices.
- **No cross-device sync**: Data lives on one device (no Chrome Sync integration yet).
- **Processing delay**: Background tasks take 6–60 seconds to complete.

---

## Future enhancements

From the product doc:

- **Semantic search**: "Find that article about React hooks from last week."
- **Export/import**: Full data portability (JSON export).
- **Cross-device sync**: Optional sync via Chrome Sync API.
- **Multi-language support**: Better prompts and parsing for non-English content.

---

## Success metrics

How we measure whether Bryn works:

- **Actionability**: Click-through rate on suggested actions.
- **Engagement**: % of suggestions that receive interaction (snooze, dismiss, act).
- **Task resumption**: How often users re-engage with an Active Intent after 24+ hours via a suggestion.
- **Intent accuracy**: % of auto-generated intents that aren't edited or deleted.
- **Completion rate**: % of Active Intents successfully moved to Completed.
- **Retention**: 30-day user retention (do they find it valuable enough to keep?).
- **Task failure rate**: Internal metric. % of tasks that fail and require retry (target <1%).
- **Data staleness**: Internal metric. Median time from page visit to insights reflected in intent summary.
