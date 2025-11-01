## 09 — Troubleshooting

Common issues and how to fix them.

---

## "AI unavailable" error

### Symptoms

- Extension loads but shows "Chrome AI is unavailable" message.
- Tasks fail immediately with "LanguageModel not available" error.
- Side panel shows a setup required screen.

### Causes

1. Chrome version <138.
2. Built-in AI model not downloaded or enabled.
3. Device doesn't support on-device AI (low-end Chromebooks, some ARM devices).

### Fixes

**1. Check Chrome version**:

- Visit `chrome://version`.
- Confirm version ≥ 138.
- If not, update Chrome: Settings → About Chrome → Check for updates.

**2. Check AI model status**:

- Visit `chrome://components`.
- Find "Optimization Guide On Device Model".
- **If missing**: Device doesn't support built-in AI. No fix available.
- **If "Downloading"**: Wait for download to complete (can take 10–30 minutes depending on connection). Restart Chrome after completion.
- **If "Ready" or "Up to date"**: Model is available.

**3. Restart Chrome completely**:

- Quit all Chrome windows.
- Relaunch Chrome.
- Reload the extension (`chrome://extensions` → Reload).

**4. Check trial tokens**:

- Tokens in `public/manifest.json` expire in late 2025.
- If expired, built-in AI must be enabled by default in Chrome (check Chrome release notes).

**5. Close and reopen the side panel**:

- AI sessions initialize lazily.
- Closing and reopening the panel triggers re-initialization.

**If none of these work**: Your device likely doesn't support on-device AI. Bryn cannot function without it.

---

## Side panel doesn't show Bryn

### Symptoms

- Clicking the Bryn icon does nothing.
- Side panel opens but shows a blank screen or error.

### Causes

1. Extension not loaded correctly.
2. Side panel permission missing.
3. React app crashed (JavaScript error).

### Fixes

**1. Reload the extension**:

- Go to `chrome://extensions`.
- Find Bryn AI and click the **Reload** icon.
- Reopen the side panel.

**2. Check permissions**:

- Go to `chrome://extensions`.
- Find Bryn AI and click **Details**.
- Scroll down to **Permissions** and confirm "sidePanel" is listed.
- If missing, rebuild the extension from source (`npm run build`) and reload.

**3. Check browser console**:

- Open the side panel.
- Right-click anywhere in the panel → Inspect.
- Check the Console tab for JavaScript errors.
- Common errors: "React is not defined", "Cannot read property of undefined".
- If errors are present, reload the extension.

**4. Try a different method to open the panel**:

- Toolbar icon.
- Extensions page (`chrome://extensions` → Bryn AI → Details → Open Side Panel).
- Keyboard shortcut (if configured).

**5. Reset the extension**:

- Go to `chrome://extensions`.
- Remove Bryn AI.
- Rebuild from source (`npm run build`).
- Load the extension again from `dist/`.

---

## No pages appear in the UI

### Symptoms

- You visit web pages but nothing shows up in Bryn.
- "All Pages" view is empty.

### Causes

1. Content script not injected.
2. Visiting invalid pages (`chrome://`, `extension://`).
3. Content script crashed or blocked by CSP.

### Fixes

**1. Confirm you're on a valid page**:

- Content scripts only run on `http://` and `https://` pages.
- They **do not run** on:
  - `chrome://` pages (Settings, Extensions, Components).
  - `extension://` pages (other extensions).
  - `file://` pages (local files, unless explicitly permitted).
- Try visiting a normal website (e.g., `https://example.com`).

**2. Check content script injection**:

- Visit a web page.
- Open the browser console (F12 → Console tab).
- Look for content script messages (e.g., "PageTracker: Initialized").
- If missing, content script didn't inject.

**3. Reload the page**:

- Content scripts inject at `document_idle` (after page load).
- If the page loaded before the extension was enabled, reload it.

**4. Check for CSP blocks**:

- Some sites have strict Content Security Policies that block extension scripts.
- Check the browser console for CSP errors (e.g., "Refused to execute inline script").
- No fix available (CSP is a security feature).

**5. Reload the extension**:

- Go to `chrome://extensions` → Reload Bryn AI.
- Refresh the web page you were trying to track.

**6. Check service worker**:

- Go to `chrome://extensions`.
- Find Bryn AI → Click "service worker" link (opens DevTools).
- Check Console for errors (e.g., "Failed to handle page data").
- If errors are present, reload the extension.

---

## Tasks stuck in queue

### Symptoms

- Task Queue shows tasks in "Queued" status for minutes/hours.
- No progress on intent assignment or label generation.

### Causes

1. Dependencies not met (blocking task).
2. Queue processor paused or crashed.
3. AI session failed to initialize.

### Fixes

**1. Check task dependencies**:

- Open Task Queue.
- Click the stuck task.
- View Task Detail → Dependencies.
- If dependencies are listed, confirm they're completed.
- If a dependency failed, retry it (click the failed task → Retry).

**2. Reload the extension**:

- Service worker might have crashed.
- Go to `chrome://extensions` → Reload Bryn AI.
- Queue will restart and resume processing.

**3. Check for failed tasks blocking the queue**:

- Open Task Queue → Filter by "Failed".
- If critical tasks (P1–P3) failed, retry them.
- Failed tasks don't block the queue by design, but if all semantic_extraction tasks fail, intent_matching tasks will be blocked.

**4. Check AI session status**:

- Open Developer Hub → Live Status.
- Look for "AI session: Initializing" or "AI session: Error".
- If error, reload the extension.

**5. Force queue execution (dev tool)**:

- No built-in "force run" button yet.
- Workaround: Delete and re-create the task by visiting the page again.

**6. Clear the queue**:

- Last resort: Backstage → Settings → Delete All Data.
- This clears all tasks and starts fresh.

---

## Intent labels are generic or missing

### Symptoms

- Intent shows "Research" or "Browsing" instead of a descriptive label like "Researching Noise-Canceling Headphones".
- Label is missing entirely.

### Causes

1. `generate_intent_label` task failed.
2. Task is still queued/processing.
3. Fallback heuristic was used (low-quality).

### Fixes

**1. Check task status**:

- Open Task Queue.
- Filter by Intent (click the intent in Intent Library → copy ID).
- Find the `generate_intent_label` task.
- **If Queued**: Wait for it to process.
- **If Processing**: Wait (can take 5–8s).
- **If Failed**: View Task Detail → Error message. Common issue: insufficient content.

**2. Retry label generation**:

- Open Intent Detail.
- Click **Regenerate Analysis**.
- This re-queues all enrichment tasks, including label generation.

**3. Check page content**:

- If intent has only 1 page with minimal content (<100 words), AI might generate a generic label.
- Add more related pages to the intent (visit them) and re-run label generation.

**4. Manually edit the label**:

- Open Intent Detail.
- Click the pencil icon next to the label.
- Type a custom label and save.

---

## Nudges/suggestions don't appear

### Symptoms

- Main Dashboard shows no suggested actions.
- "Suggested Actions" section is empty.

### Causes

1. No Active intents.
2. Nudge Generator hasn't run yet.
3. No triggers met (no dormant intents, no knowledge gaps).

### Fixes

**1. Confirm you have Active intents**:

- Open Backstage → Intent Library → Active.
- If empty, visit more pages to create intents.

**2. Wait for periodic tasks**:

- Nudge Generator runs every hour.
- Knowledge gap analysis (`ai_analyze_knowledge_gaps`) runs every 6 hours.
- Milestone prediction (`ai_predict_milestone`) runs every hour.
- Give it time after creating intents.

**3. Create conditions for nudges**:

- **Dormant reminder**: Don't visit an Active intent for 7+ days.
- **Knowledge gap**: Visit 3+ pages on related topics (e.g., React Hooks, React State).
- **Merge suggestion**: Create 2+ intents with similar content.

**4. Check nudge status**:

- Open Backstage → view all intents.
- Click an intent → check if nudges were generated but dismissed.
- No UI yet to view dismissed nudges (future feature).

**5. Force nudge generation (dev workaround)**:

- No built-in button yet.
- Workaround: Open browser console on service worker (`chrome://extensions` → Bryn AI → service worker).
- Run: `nudgeGenerator.generateNudges()` (requires developer knowledge).

---

## Storage quota exceeded

### Symptoms

- Error: "QuotaExceededError: The quota has been exceeded."
- Pages stop saving.

### Causes

1. Too much data stored (thousands of pages).
2. IndexedDB corruption.

### Fixes

**1. Check storage usage**:

- Open Backstage → Settings.
- View "Storage Used" metric.
- If >100MB, consider deleting old data.

**2. Delete completed intents**:

- Open Backstage → Intent Library → Completed.
- Delete old completed intents (this also deletes associated pages).

**3. Delete old queue tasks**:

- Open Task Queue → Filter by Completed.
- Delete all completed tasks (they're kept for 7 days by default).

**4. Delete all data**:

- Last resort: Backstage → Settings → Delete All Data.
- Confirms before wiping everything.

**5. Verify `unlimitedStorage` permission**:

- Go to `chrome://extensions`.
- Find Bryn AI → Details → Permissions.
- Confirm "unlimitedStorage" is listed.
- If missing, rebuild the extension.

---

## UI is slow or laggy

### Symptoms

- Side panel takes seconds to open.
- Scrolling is janky.
- View transitions are slow.

### Causes

1. Too much data (thousands of pages/intents).
2. Too many active tasks in queue.
3. Device is low on memory.

### Fixes

**1. Reduce data size**:

- Delete old intents and completed tasks (see "Storage quota exceeded" fixes).

**2. Close other tabs/extensions**:

- Chrome extensions share memory.
- Close unused tabs and disable unused extensions.

**3. Restart Chrome**:

- Memory leaks in service workers can accumulate.
- Restart Chrome to clear them.

**4. Check CPU usage**:

- AI tasks are CPU-intensive.
- If queue has 30+ tasks, wait for them to complete before using Bryn heavily.

**5. Use a more powerful device**:

- On-device AI requires decent CPU/RAM (Intel i5+, 8GB+ RAM recommended).
- Low-end devices (Chromebooks, old laptops) will be slower.

---

## Export data fails

### Symptoms

- Clicking "Export All Data" does nothing.
- Download starts but file is corrupt (empty or invalid JSON).

### Causes

1. Too much data (>100MB).
2. Browser blocked the download.
3. IndexedDB read error.

### Fixes

**1. Check browser downloads**:

- Chrome might have blocked the download.
- Go to `chrome://downloads`.
- Look for the blocked download and allow it.

**2. Reduce data size before exporting**:

- Delete completed intents and old tasks.
- Try exporting again.

**3. Export in smaller chunks** (manual workaround):

- No built-in feature yet.
- Use browser DevTools to manually export IndexedDB:
  - F12 → Application → IndexedDB → BrynAI_DB.
  - Right-click a store → Export.

**4. Check console for errors**:

- Open side panel → Inspect → Console.
- Look for IndexedDB errors during export.

---

## Resetting state (last resort)

If all else fails, start fresh:

**1. Delete all data via UI**:

- Backstage → Settings → Delete All Data → Confirm.
- This wipes all pages, intents, nudges, and tasks.

**2. Remove and reload the extension**:

- Go to `chrome://extensions`.
- Click **Remove** on Bryn AI.
- Rebuild from source (`npm run build`).
- Load the extension again from `dist/`.

**3. Clear IndexedDB manually**:

- F12 → Application → IndexedDB → BrynAI_DB → right-click → Delete database.
- Reload the extension.

**4. Use a fresh Chrome profile**:

- Create a new Chrome profile (Settings → Manage profiles → Add).
- Load the extension in the new profile.
- All data is isolated per profile.

---

## Getting help

If you can't resolve an issue:

**1. Check logs**:

- Service worker logs: `chrome://extensions` → Bryn AI → service worker → Console.
- Side panel logs: Open side panel → Inspect → Console.

**2. Export diagnostics**:

- Task Queue → Copy task history.
- Scenario Runner → Copy logs.
- Settings → Export All Data (if possible).

**3. Report the issue**:

- Include Chrome version, OS, and reproduction steps.
- Attach logs and exported data (if not sensitive).

**Code reference**: `src/background/service-worker.ts` (initialization and error handling), `src/sidepanel/views/backstage-view.tsx` (Settings actions).
