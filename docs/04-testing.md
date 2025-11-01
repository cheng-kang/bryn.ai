## 04 — Testing

Bryn includes built-in developer tools for testing, debugging, and validating system behavior. These tools are accessible via the **Developer Hub** in the side panel.

---

## Scenario Runner

The Scenario Runner executes curated test scenarios that exercise core functionality and generate live logs for monitoring.

### How to use

1. **Open Developer Hub** → Click "Scenario Runner" in the navigation.
2. **Select a scenario** from the list (e.g., "Fragmented Research", "Smart Completion", "Graceful Failure").
3. **Click "Run"** to start execution.
4. **Watch the live log** stream for progress, task scheduling, and errors.

### What scenarios test

Each scenario validates a specific user flow or system behavior:

- **Fragmented Research**: Simulates multi-session research (visiting related pages across days). Tests intent clustering and label generation.
- **Smart Completion**: Simulates a purchase flow (browsing → cart → checkout → confirmation). Tests milestone detection and auto-completion.
- **Graceful Failure**: Simulates AI failures and network errors. Tests retry logic and fallback behavior.
- **Knowledge Gap Detection**: Simulates focused research in one area. Tests AI synthesis of missing knowledge.
- **Merge Opportunities**: Creates multiple related intents. Tests merge detection and suggestions.

### Reading the logs

Logs use color-coded levels:

- **INFO** (gray): General progress (e.g., "Starting scenario: Fragmented Research").
- **ACTION** (blue): User simulation (e.g., "Visiting page: React Hooks Tutorial").
- **DETECT** (green): System detection (e.g., "Intent created: React Learning").
- **WARN** (yellow): Warnings (e.g., "Task retry scheduled").
- **ERROR** (red): Failures (e.g., "AI session crashed").
- **SUCCESS** (green, bold): Scenario completion (e.g., "✓ Scenario passed").

**Tip**: Use the "Copy Logs" button to export the full log for debugging or sharing.

**Code reference**: `src/sidepanel/views/scenario-runner-view.tsx`, `src/sidepanel/utils/test-scenarios.ts`.

---

## Task Queue Viewer

The Task Queue Viewer shows all queued, processing, completed, and failed tasks in real-time.

### How to use

1. **Open Developer Hub** → Click "Task Queue".
2. **Filter by status**: Use the tabs to view Queued, Processing, Completed, or Failed tasks.
3. **Click a task** to open the Task Detail modal.

### What you see

Each task shows:

- **Type**: Task name (e.g., "semantic_extraction").
- **Priority**: Lower number = higher priority (e.g., P1 runs before P20).
- **Status**: "queued" | "processing" | "completed" | "failed".
- **Entity**: Associated page or intent (clickable to navigate).
- **Created**: How long ago the task was enqueued.

### Task Detail modal

Clicking a task opens a detailed view with:

- **Input**: What was sent to the AI (e.g., page content, current intents).
- **Output**: What the AI returned (e.g., extracted concepts, generated label).
- **Prompt**: The full AI prompt used (truncated for readability).
- **Performance**: Latency, retry count, error messages.
- **Dependencies**: Tasks that must complete before this one.

**Why this matters**: You can debug exactly why a label was generated, why a page was assigned to an intent, or why a task failed.

**Code reference**: `src/sidepanel/views/task-queue-view.tsx`.

---

## Suggested testing workflow

### 1. Start with a simple scenario

Run **Fragmented Research** to validate the core flow:

- Page save → semantic extraction → intent matching → label generation.

**What to check**:

- Do pages appear in the UI within 20ms?
- Does intent assignment happen within 15–60s?
- Are labels human-readable and accurate?

### 2. Observe task scheduling

Open the Task Queue during scenario execution:

- Confirm **dependencies unlock correctly** (e.g., `intent_matching` waits for `semantic_extraction`).
- Confirm **priorities are respected** (P1 tasks run before P20 tasks).
- Confirm **concurrency limits** are enforced (max 1 critical task at a time).

### 3. Validate enrichment tasks

After the scenario completes:

- Open the Intent Detail view for the generated intent.
- Confirm **label, goal, summary, insights, and next steps** are present.
- Click **Regenerate Analysis** to test refresh logic.

### 4. Test failure scenarios

Run **Graceful Failure** to validate retry logic:

- Tasks should retry with exponential backoff (check Task Detail for attempt history).
- Failed tasks should **not block unrelated work** (other tasks continue).
- After retries, tasks should either succeed or fail permanently (logged in Task Detail).

### 5. Validate continuous refresh

1. Run a scenario that creates an intent.
2. Manually visit a new related page (not part of the scenario).
3. Open the Task Queue and confirm **refresh tasks** are enqueued at lower priority (P15, P25).
4. Wait for tasks to complete and confirm the **intent label/summary updates**.

---

## Interpreting task statuses

### Queued

Task is waiting in the queue. Check:

- Are there dependencies blocking it? (View Task Detail → Dependencies).
- Is the queue backlogged? (Check Live Status for queue depth).

### Processing

Task is currently running. Check:

- How long has it been processing? (If >60s, might be stuck).
- Is the AI session healthy? (Reload extension if stuck).

### Completed

Task finished successfully. Check:

- Was the output reasonable? (View Task Detail → Output).
- What was the latency? (Compare to expected duration, e.g., semantic_extraction ~12s).

### Failed

Task failed after retries. Check:

- **Error message** (View Task Detail → Error).
- **Retry history** (View Task Detail → Attempts).
- **Common causes**: AI session crash, timeout, invalid input, model unavailable.

---

## Live Status metrics

The Live Status component (visible in Developer Hub and Backstage) shows:

### Queue metrics

- **Pending tasks**: Number of tasks waiting in queue.
- **Processing tasks**: Number of tasks currently running.
- **Recent failures**: Number of tasks that failed in the last hour.

### Performance metrics

- **Avg task latency**: Average time from task creation to completion.
- **Queue depth trend**: Is the backlog growing or shrinking?

### Health indicators

- **AI session status**: Are sessions initializing correctly?
- **Task failure rate**: If >1%, investigate common errors.

**Why this matters**: Quick health check without diving into detailed logs.

**Code reference**: `src/sidepanel/components/live-status/index.tsx`.

---

## Common testing issues

### Tasks stuck in "Queued" status

**Cause**: Dependencies not met or queue processor paused.

**Fixes**:

1. Check Task Detail → Dependencies. Are prerequisite tasks completed?
2. Reload the extension to restart the queue processor.

### Tasks fail immediately with "AI unavailable"

**Cause**: Built-in AI not initialized.

**Fixes**:

1. Check `chrome://components` for model download status.
2. Reload the extension after model is ready.
3. Confirm Chrome version ≥ 138.

### Scenario runner shows errors but no logs

**Cause**: Test executor crashed or log buffer filled.

**Fixes**:

1. Reload the side panel and re-run the scenario.
2. Check browser console (F12) for errors in the test executor.

### Intent labels are generic ("Research" instead of "React Hooks Learning")

**Cause**: Label generation task failed or used fallback heuristic.

**Fixes**:

1. Open Task Queue and find the `generate_intent_label` task for that intent.
2. Check Task Detail → Error. Common issue: insufficient page content.
3. Re-run label generation via Intent Detail → Regenerate Analysis.

---

## Performance benchmarks

Expected task durations on a mid-range device (Intel i5, 16GB RAM):

| Task Type               | Expected Duration |
| ----------------------- | ----------------- |
| semantic_extraction     | 10–15s            |
| classify_behavior       | 4–6s              |
| summarization           | 3–5s              |
| intent_matching         | 300–700ms         |
| generate_intent_label   | 5–8s              |
| generate_intent_summary | 7–10s             |

**If tasks are significantly slower**:

- Device may be underpowered.
- AI model may be swapped to disk (low memory).
- Other extensions may be competing for resources.

**Code reference**: `src/core/processing-queue.ts` lines 391–407 (taskAverages with default durations).

---

## Debugging tips

### Use Task Detail to trace decisions

Example: "Why was this page assigned to Intent A instead of Intent B?"

1. Find the `intent_matching` task for that page in Task Queue.
2. View Task Detail → Prompt (shows candidate intents and similarity scores).
3. View Task Detail → Output (shows final decision and confidence).

### Use logs to trace scenario execution

Example: "Why did the Smart Completion scenario fail?"

1. Copy logs from Scenario Runner.
2. Search for "ERROR" or "WARN" entries.
3. Trace back to the action that triggered the error.

### Use Live Status for quick health checks

Before running a scenario:

1. Check queue depth (should be <10 for fast execution).
2. Check recent failures (should be 0).
3. If queue is backed up, wait or clear completed tasks.

---

## Further testing

Beyond the Scenario Runner, you can:

- **Manual testing**: Visit real websites and observe intent formation.
- **Edge case testing**: Visit error pages, SPAs, media-heavy sites to test content extraction.
- **Load testing**: Visit 100+ pages rapidly to test queue performance.
- **Long-term testing**: Use Bryn for a week and observe dormant intent detection, merge suggestions, and knowledge gap synthesis.

**Code reference**: `src/sidepanel/utils/test-executor.ts` (test execution logic).
