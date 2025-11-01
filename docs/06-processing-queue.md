## 06 — Processing Queue

The Processing Queue is the heart of Bryn's asynchronous architecture. It schedules AI and enrichment tasks with priorities, dependencies, concurrency limits, and robust retry logic to ensure eventual consistency without blocking the UI.

---

## Purpose

**Problem**: AI tasks are slow (4–15s each). Running them all immediately would:

- Block the UI for minutes.
- Spike memory usage (each AI session uses ~20–50MB).
- Fail if dependencies aren't met (e.g., intent matching requires semantic features first).

**Solution**: A priority scheduler that:

- Processes tasks in the background when resources are available.
- Respects dependencies (Task B waits for Task A).
- Retries failures with exponential backoff.
- Persists state to IndexedDB (survives extension reloads).

---

## Task types

The queue handles 15 task types across three categories:

### Page-level tasks

- **semantic_extraction** (P1, ~12s): AI extracts concepts, entities, intent signals from page content.
- **classify_behavior** (P3, ~5s): AI classifies user interaction (Deep Reading, Skimming, Watching, Form Filling, etc.).
- **summarization** (P4, ~4s): AI generates concise summary of page content (only for pages >5KB).
- **intent_matching** (P2, ~500ms): Algorithmic matching with optional AI verification. Depends on `semantic_extraction`.

### Intent-level tasks

- **generate_intent_label** (P5, ~6s): AI generates human-readable label (e.g., "Researching noise-canceling headphones").
- **generate_intent_goal** (P6, ~5s): AI infers user's goal (e.g., "Decide which headphones to buy").
- **generate_intent_summary** (P20, ~8s): AI summarizes all pages in the intent.
- **generate_intent_insights** (P21, ~10s): AI identifies patterns and key takeaways.
- **generate_intent_next_steps** (P22, ~8s): AI suggests actionable next steps.
- **ai_verify_intent_matching** (P15, ~12s): AI double-checks page assignment for quality.
- **scan_intent_merge_opportunities** (P17, ~15s): AI scans for related intents that could be merged.
- **merge_intents** (P25, ~2s): Algorithmic merge (fast, no AI).

### System-level tasks

- **ai_analyze_knowledge_gaps** (P30, ~15s): Periodic. AI synthesizes missing knowledge from graph.
- **ai_predict_milestone** (P30, ~15s): Periodic. AI predicts next milestone or completion.
- **generate_activity_summary** (P30, ~10s): Periodic. AI summarizes recent activity for dashboard.

**Code reference**: `src/core/processing-queue.ts` lines 281–298 (QueuedTask type definition).

---

## Priority design

### Priority bands

Tasks are grouped into three priority bands with different concurrency limits:

| Band           | Priorities | Max Concurrent | Examples                                                      |
| -------------- | ---------- | -------------- | ------------------------------------------------------------- |
| **Critical**   | 1–3        | 1              | semantic_extraction, classify_behavior, intent_matching       |
| **Important**  | 5–17       | 2              | generate_intent_label, ai_verify_intent_matching, scan_merge  |
| **Background** | 20–30      | 1              | generate_intent_summary, insights, knowledge_gaps, milestones |

**Why limit concurrency?**

- **Memory**: Each AI session uses ~20–50MB. Running 5 at once would spike to 250MB.
- **CPU**: AI tasks are CPU-intensive. Limiting concurrency keeps the browser responsive.
- **Serialization**: Critical page tasks must run one at a time to avoid race conditions (e.g., two pages trying to assign to the same intent simultaneously).

**Code reference**: `src/core/processing-queue.ts` lines 372–388 (PRIORITY_LIMITS).

---

### Task ordering

Within a priority band, tasks are ordered by:

1. **Dependency-ready first**: Tasks with unmet dependencies are skipped.
2. **Creation time** (FIFO): Oldest tasks first.

**Example queue**:

```
[P1: semantic_extraction (Page A, created 100ms ago)]
[P1: semantic_extraction (Page B, created 50ms ago)]  ← runs first (same priority, older)
[P2: intent_matching (Page A, depends on P1 Page A)]  ← blocked until P1 Page A completes
[P5: generate_intent_label (Intent X)]
```

---

## Dependencies

Tasks can declare explicit dependencies using task IDs.

**Example**: When a page is saved, the flow is:

1. Enqueue `semantic_extraction` → returns `taskA_id`.
2. Enqueue `intent_matching` with `dependencies: [taskA_id]`.
3. `intent_matching` won't run until `taskA_id` completes.

**Dependency graph**: The queue builds a graph on initialization:

- Maps task IDs to task objects.
- Tracks which tasks depend on which.
- Unblocks dependent tasks when prerequisites complete.

**Why explicit dependencies instead of implicit?** Explicit is clearer and prevents subtle bugs (e.g., forgetting that Task C depends on Task A).

**Code reference**: `src/core/processing-queue.ts` lines 314–316 (dependencies field), lines 789–790 (buildDependencyGraph call).

---

## Retry logic

When a task fails (e.g., AI session crashes, timeout), the queue:

1. Logs the error and attempt metadata.
2. Increments `retryCount`.
3. Schedules a retry with **exponential backoff**: 1s, 2s, 4s, 8s, 16s, ...
4. Moves to lower priority (e.g., P5 → P10) to avoid blocking other work.

**Max retries**: 5 attempts. After that, the task is marked "failed" permanently and logged for debugging.

**Why exponential backoff?** Prevents retry storms. If AI is temporarily unavailable (e.g., model downloading), constant retries would waste resources.

**Graceful degradation**: Failed tasks don't block unrelated work. If `summarization` fails, `generate_intent_label` still runs.

**Code reference**: `src/core/processing-queue.ts` lines 318–320 (attempts array, errorType).

---

## Execution metadata

Every task records detailed execution data for debugging and performance tracking:

**aiExecution** field:

- `api`: "LanguageModel" | "Summarizer" | "LanguageDetector" | "none".
- `prompt`: The full prompt sent to the AI (truncated for storage).
- `response`: The raw AI response.
- `parameters`: Temperature, topK, model name.

**Structured I/O**:

- `structuredInput`: Task-specific input (e.g., page content, intent ID).
- `structuredOutput`: Parsed result (e.g., extracted concepts, generated label).

**Performance tracking**:

- `startedAt`, `completedAt`, `durationMs`: Timestamps and latency.
- Task averages are tracked globally (e.g., semantic_extraction avg = 12s) for ETA estimation.

**Why track this?** Enables powerful debugging:

- "Why was this label generated?" → View the prompt and response.
- "Why did this task fail?" → View error message and attempt history.
- "Is AI getting slower?" → View average durations over time.

**Code reference**: `src/core/processing-queue.ts` lines 335–349 (aiExecution, structuredInput/Output), lines 391–407 (taskAverages).

---

## Continuous refresh

When a page is added to an existing intent, the Intent Engine triggers a **refresh cycle**:

1. Detects that the intent's data has changed.
2. Re-queues enrichment tasks at **lower priority** (e.g., P5 → P15, P20 → P25).
3. Tasks run when resources are available.
4. Intent's label/summary/insights update to reflect the new context.

**Why lower priority?** Refresh tasks are less urgent than new page processing. Users expect new pages to be analyzed quickly, but intent refresh can wait.

**Frequency**: Every time a page is added or removed from an intent.

**Code reference**: `src/core/intent-engine.ts` (assignPageToIntent triggers re-queueing).

---

## Queue state persistence

The queue state is persisted to the `processingQueue` IndexedDB store:

- On task creation → saved immediately.
- On task status change (queued → processing → completed) → updated.
- On extension reload → queue restores pending tasks and resumes.

**Why persist?** Service workers can be terminated at any time. Persistence ensures tasks aren't lost.

**Cleanup**: Completed and failed tasks are deleted after 7 days to keep the queue lean.

**Code reference**: `src/core/processing-queue.ts` lines 792–793 (persistQueue call after addTask).

---

## Performance characteristics

### Typical task durations (defaults)

- semantic_extraction: ~12s
- classify_behavior: ~5s
- summarization: ~4s
- intent_matching: ~500ms (algorithmic)
- generate_intent_label: ~6s
- generate_intent_summary: ~8s
- ai_verify_intent_matching: ~12s

**Note**: Actual durations vary by content length, device performance, and AI model load.

### Throughput

- **With 1 concurrent AI task**: ~5 tasks/minute (avg 12s each).
- **With 2 concurrent AI tasks** (important band): ~10 tasks/minute.

### Latency

- **Best case** (page save → intent assignment): ~15s (if queue is empty).
- **Typical case** (5 tasks ahead): ~60s.
- **Worst case** (30 tasks ahead): ~6 minutes.

**Why is this acceptable?** Users see their page saved instantly. The enrichment arriving in 15–60s is a pleasant surprise, not a blocker.

---

## Monitoring

### In the UI (Task Queue View)

- Filter by status (Queued, Processing, Completed, Failed).
- See priority, retry count, and dependencies.
- Click a task to view detailed execution data (prompt, response, error).

### Metrics tracked internally

- **Task failure rate**: % of tasks that fail and require retry. Target <1%.
- **Average latency**: Time from task creation to completion.
- **Queue depth**: Number of pending tasks (indicates backlog).

**Code reference**: `src/sidepanel/views/task-queue-view.tsx` (UI), `src/core/processing-queue.ts` (metrics).

---

## Why this design?

**Alternatives considered**:

1. **Run all tasks immediately**: Would block for minutes and spike memory.
2. **Use Web Workers**: Service workers can't spawn Web Workers in MV3.
3. **Cloud-based queue**: Would violate privacy principles (all data must stay local).

**Chosen design** (priority queue + dependencies + retries) balances:

- **Responsiveness**: UI never blocks.
- **Correctness**: Dependencies ensure tasks run in the right order.
- **Resilience**: Retries handle transient failures.
- **Privacy**: Everything runs locally.

**Trade-offs**:

- Complexity (dependency graphs, retry logic).
- Latency (tasks wait in queue).
- Memory (persistent queue state in IndexedDB).

But the alternative (blocking UI or sending data to cloud) is unacceptable.
