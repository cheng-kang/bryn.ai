## 08 — UI Guide

The Bryn side panel is organized around **actions**, not administration. The main views help you resume, explore, and complete your research with minimal friction.

---

## Main views

### 1. Main Dashboard (default view)

**What you see**:

- **Suggested Actions**: Actionable cards from the Nudge Generator (e.g., "Ready to pick up your React hooks reading?").
- **Recent Activity**: Natural-language summary (e.g., "This morning you were catching up on Project Phoenix docs and researching new headphones.").
- **Quick stats**: Active intents count, pages visited today.

**Purpose**: The primary focus is taking action, not organizing.

**Navigation**: Click a suggestion to resume, explore, or complete an intent.

---

### 2. Backstage (control center)

**What you see**:

- **Intents Library**: All detected intents (Active, Dormant, Completed).
- **All Pages**: Chronological list of visited pages.
- **Task Queue** (if Developer mode enabled): Background processing status.
- **Settings**: Data management, export/delete, developer tools toggle.

**Purpose**: See everything Bryn is working on. Power users and debugging.

**Navigation**: Click "Backstage" button at the bottom of the main view.

---

### 3. Developer Hub (diagnostics and testing)

**What you see**:

- **Scenario Runner**: Execute curated test scenarios.
- **Live Status**: Queue metrics, recent failures, processing rates.
- **Quick links**: Jump to Task Queue, Intents, Pages.

**Purpose**: Validate behavior, debug issues, monitor performance.

**Navigation**: Click "Developer Hub" button at the bottom of the main view (if developer mode enabled).

**Enabling**: Backstage → Settings → Enable Developer Tools toggle.

---

### 4. Intent Library (organized research)

**What you see**:

- **Tabs**: Active, Dormant, Completed intents.
- **Intent cards**: Label, goal, page count, last updated, thumbnail.
- **Filters**: Search by keyword, sort by date/activity.

**Purpose**: Browse all detected intents, edit them, or mark them completed.

**Navigation**: Backstage → Intent Library.

---

### 5. Intent Detail (deep dive)

**What you see**:

- **Label and goal** (editable).
- **Summary and insights** (AI-generated).
- **Next steps** (suggested actions).
- **All pages** in the intent (clickable to Page Detail).
- **Actions**: Regenerate Analysis, Mark as Completed, Delete Intent.

**Purpose**: Understand why Bryn grouped these pages together, edit the analysis, or mark the intent done.

**Navigation**: Click any intent card from Main Dashboard or Intent Library.

---

### 6. Page Detail (single page analysis)

**What you see**:

- **Metadata**: URL, title, domain, language, timestamp, visit count.
- **Content summary**: AI-generated or first 500 chars.
- **Semantic features**: Concepts, entities, intent signals.
- **Interactions**: Scroll depth, dwell time, engagement score, behavior classification.
- **Intent assignment**: Which intent this page belongs to and why (confidence score).

**Purpose**: Understand what Bryn extracted from this page.

**Navigation**: Click any page card from All Pages or Intent Detail.

---

### 7. Task Queue (background processing)

**What you see**:

- **Tabs**: Queued, Processing, Completed, Failed.
- **Task cards**: Type, priority, status, entity (page or intent), created timestamp.
- **Filters**: By task type, by intent.

**Purpose**: Monitor and debug background AI tasks.

**Navigation**: Developer Hub → Task Queue or Backstage → Task Queue (if developer mode enabled).

---

### 8. Task Detail (execution analysis)

**What you see**:

- **Input**: What was sent to the AI.
- **Output**: What the AI returned.
- **Prompt**: Full AI prompt (truncated for readability).
- **Performance**: Latency, retry count, error messages.
- **Dependencies**: Tasks that must complete before this one.

**Purpose**: Debug why a label was generated, why a task failed, or how long it took.

**Navigation**: Click any task card from Task Queue.

---

### 9. Scenario Runner (automated testing)

**What you see**:

- **Scenario list**: Curated test flows (Fragmented Research, Smart Completion, etc.).
- **Execution tab**: Live log stream with color-coded messages.
- **Controls**: Run, Stop, Reset, Copy Logs.

**Purpose**: Validate core functionality, reproduce issues, demonstrate behavior.

**Navigation**: Developer Hub → Scenario Runner.

---

## Key actions and controls

### From Main Dashboard

- **Click a suggestion**: Jump to the suggested page or intent.
- **Snooze a suggestion**: Hide it for 24 hours.
- **Dismiss a suggestion**: Remove it permanently.

### From Intent Detail

- **Regenerate Analysis**: Re-run all AI tasks (label, summary, insights, next steps) for this intent.
- **Mark as Completed**: Move the intent from Active to Completed (removes it from main dashboard).
- **Edit label/goal**: Click the pencil icon to manually edit.
- **Delete intent**: Remove the intent and unassign all pages.

### From Page Detail

- **Reassign to intent**: Manually change which intent this page belongs to.
- **Delete page**: Remove the page from Bryn (doesn't affect browser history).

### From Task Queue

- **Retry failed task**: Click the task → Retry button.
- **Cancel queued task**: Click the task → Cancel button.
- **View task detail**: Click any task card.

### From Settings

- **Export all data**: Download a JSON file with all pages, intents, nudges, and tasks.
- **Delete all data**: Wipe everything (confirmation required).
- **Enable Developer Tools**: Toggle visibility of Task Queue and Scenario Runner.

---

## Navigation tips

### Quick access

- **Backstage button** (bottom of main view): Jump to Intents, Pages, Queue, Settings.
- **Developer Hub button** (bottom of main view, if enabled): Jump to diagnostics and testing.

### Breadcrumbs

- Use the back button (top-left) to navigate up the view stack.
- View stack is preserved (e.g., Main → Intent Detail → Page Detail → back → back → Main).

### Keyboard shortcuts

- **Esc**: Close modals or go back one level.
- No other keyboard shortcuts currently implemented.

---

## Live status components

**Where they appear**: Developer Hub, Backstage (when developer mode enabled).

**What they show**:

- **Queue depth**: Number of tasks pending/processing.
- **Recent failures**: Tasks that failed in the last hour.
- **Processing rate**: Tasks completed per minute.
- **AI session status**: Healthy or initializing.

**Why this matters**: Quick health check without opening Task Queue.

**Code reference**: `src/sidepanel/components/live-status/index.tsx`.

---

## UI reactivity (how updates work)

Bryn's UI updates in real-time as background tasks complete:

1. **Storage emits events** when data changes (e.g., `page-added`, `intent-updated`).
2. **React hooks subscribe** to these events (`use-realtime-updates.ts`).
3. **Components re-render** automatically to show the latest data.

**Result**: You see pages appear instantly (~20ms after visit) and watch intents/labels/summaries populate as AI tasks finish (~15–60s).

**Code reference**: `src/sidepanel/hooks/use-realtime-updates.ts`.

---

## Visual design principles

### 1. Action-first layout

The main dashboard shows suggestions, not raw data. Intents are one level deep (Backstage).

### 2. Natural language

Labels and summaries read like a colleague wrote them ("Ready to pick up..."), not system logs ("Task #47, 70% complete").

### 3. Minimal chrome

No sidebars, toolbars, or navigation clutter. One focused view at a time.

### 4. Progressive disclosure

Advanced features (Task Queue, Scenario Runner) are hidden until you enable Developer Tools.

**Why?** Most users want to act, not debug. Power users can opt in.

---

## Accessibility

- **Keyboard navigation**: Tab through interactive elements. Enter to activate.
- **Focus indicators**: Visible outlines on focused elements.
- **Screen reader support**: ARIA labels on buttons and controls (work in progress).
- **Color contrast**: Meets WCAG AA standards for text readability.

**Code reference**: `src/components/ui/` (Radix UI primitives with accessibility built-in).

---

## Performance

The side panel is optimized for responsiveness:

- **Virtual scrolling** (Scroll Area component) for long lists (thousands of pages/intents).
- **Lazy loading**: Page Detail views load content on demand.
- **Debounced search**: Search inputs wait 300ms before filtering.
- **Memoized components**: Expensive renders are cached.

**Expected performance**:

- **Initial load**: <500ms.
- **View transition**: <100ms.
- **Live update**: <50ms (from storage event to UI update).

**Code reference**: `src/sidepanel/App.tsx` (routing and view management).

---

## Troubleshooting UI issues

### Pages don't appear in the UI

**Cause**: Storage event not emitted or React hook not subscribed.

**Fixes**:

1. Reload the side panel (close and reopen).
2. Check browser console for React errors.
3. Verify pages exist in IndexedDB (Backstage → All Pages).

### Intent labels are missing or generic

**Cause**: `generate_intent_label` task failed or still processing.

**Fixes**:

1. Open Task Queue and find the task for that intent.
2. Check status (Queued? Failed? Completed?).
3. If failed, view error message in Task Detail.
4. If queued, wait for it to process.
5. If completed but label is still generic, try Regenerate Analysis in Intent Detail.

### Suggestions don't appear on main dashboard

**Cause**: Nudge Generator hasn't run or no triggers met.

**Fixes**:

1. Confirm you have Active intents (Backstage → Intent Library).
2. Wait for periodic tasks to run (knowledge gaps, milestones run every hour).
3. Manually trigger dormant intent nudges by waiting 7+ days without visiting an intent.

### UI is slow or laggy

**Cause**: Too many tasks in queue or large dataset (thousands of pages).

**Fixes**:

1. Delete old completed tasks (Backstage → Task Queue → filter Completed → Delete All).
2. Delete old intents (Backstage → Intent Library → Completed → Delete).
3. Clear all data and start fresh (Settings → Delete All Data).

---

## Customization (future)

Planned UI customization options (not yet implemented):

- **Theme**: Dark mode / light mode toggle.
- **Layout**: Compact / comfortable density.
- **Filters**: Custom filters for intents (e.g., "show only work-related").
- **Notifications**: Desktop notifications for new suggestions.

**Code reference**: `src/types/settings.ts` (DEFAULT_SETTINGS).
