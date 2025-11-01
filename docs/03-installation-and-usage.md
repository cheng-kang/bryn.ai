## 03 — Installation & Usage

### Prerequisites

**Chrome version**: 138 or higher with built-in AI (Gemini Nano) available.

**How to check**:

1. Visit `chrome://version` and confirm version ≥ 138.
2. Visit `chrome://components` and check "Optimization Guide On Device Model" status.
3. If the model is downloading, wait for it to complete and reload the extension.

**Notes**:

- Built-in AI availability varies by platform and device.
- Trial tokens are included in `public/manifest.json` to enable AI features during development (they expire in late 2025).
- Content scripts do not run on `chrome://` or `extension://` pages by design.

---

## Build and load

### Step 1: Install dependencies and build

```bash
npm install
npm run build
```

This runs TypeScript compilation and Vite bundling. Output goes to `dist/`.

### Step 2: Load the unpacked extension

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in top-right).
3. Click **Load unpacked**.
4. Select the `dist/` folder from the Bryn project directory.
5. The extension should appear in your extensions list with a green "Enabled" badge.

### Step 3: Pin the extension (optional but recommended)

1. Click the puzzle icon in the Chrome toolbar.
2. Find "Bryn AI" and click the pin icon.
3. The Bryn icon will appear in your toolbar for quick access.

---

## Open the side panel

**Method 1** (via toolbar):

- Click the Bryn icon in the toolbar.

**Method 2** (via extensions page):

- Go to `chrome://extensions`.
- Find Bryn AI and click "Details".
- Scroll down and click "Open Side Panel".

**Method 3** (via keyboard shortcut, if configured):

- Set a keyboard shortcut in `chrome://extensions/shortcuts`.

---

## First run

### 1. Start browsing normally

Visit a few web pages (news articles, blog posts, product pages). The content script will log page metadata and interactions.

### 2. Check the side panel

Open the Bryn side panel. You should see:

- **Pages** appearing within seconds of visiting them.
- **Intents** forming after ~15–60 seconds as background tasks complete.
- **Live Status** showing queue activity (tasks pending, processing, completed).

### 3. Explore Backstage and Developer Hub

- **Backstage**: Navigate to Intents, Pages, and Queue views to see what Bryn is working on.
- **Developer Hub**: Access diagnostics, Scenario Runner, and queue monitoring tools.

---

## Development workflow

### Making code changes

1. Edit source files in `src/`.
2. Run `npm run build` to rebuild.
3. Go to `chrome://extensions` and click the **Reload** icon for Bryn AI.
4. Refresh the side panel or reopen it to see changes.

### Hot reloading (UI only)

For faster UI iteration, you can run:

```bash
npm run dev
```

This starts Vite's dev server with hot module replacement. Open `http://localhost:5173` to preview the side panel UI in a browser tab.

**Note**: This only works for UI changes. Background logic (service worker, content script) still requires a full rebuild and reload.

---

## Environments & profiles

### Using a separate Chrome profile

For clean experiments or testing, create a dedicated Chrome profile:

1. Click your profile icon in Chrome → "Add" → create a new profile.
2. Open the new profile and load the extension from `dist/`.
3. All IndexedDB data is isolated to this profile.

**Why?** Keeps test data separate from personal browsing. Useful for debugging and scenario testing.

### Resetting state

To start fresh:

1. Go to the Backstage view → Settings.
2. Click **Delete All Data** and confirm.
3. Alternatively, remove and re-load the extension (clears IndexedDB automatically).

---

## Enabling Developer Tools

Developer features (Task Queue, Scenario Runner, detailed logs) are hidden by default for a cleaner user experience.

**To enable**:

1. Open the Backstage view.
2. Click **Developer Hub** in the bottom navigation.
3. Developer tools are now accessible.

**What you get**:

- **Task Queue View**: Inspect queued, processing, and failed tasks.
- **Scenario Runner**: Execute curated test scenarios and watch live logs.
- **Live Status**: Detailed metrics on queue load, task failures, and processing rates.

---

## Common setup issues

### "AI unavailable" error

**Cause**: Chrome's built-in AI isn't available on your device or version.

**Fixes**:

1. Confirm Chrome ≥ 138 (`chrome://version`).
2. Check `chrome://components` for "Optimization Guide On Device Model". If it says "Downloading", wait and retry.
3. Restart Chrome after the model finishes downloading.
4. Some devices (low-end Chromebooks) may not support on-device AI.

### Side panel doesn't show Bryn

**Cause**: Extension not loaded correctly or side panel permission missing.

**Fixes**:

1. Reload the extension in `chrome://extensions`.
2. Confirm `sidePanel` permission is listed in `public/manifest.json`.
3. Reopen the side panel via the toolbar icon or extensions page.

### No pages appear after visiting websites

**Cause**: Content script not injected or invalid context.

**Fixes**:

1. Confirm you're visiting a normal web page (not `chrome://` or `extension://`).
2. Check the browser console on the target page for content script errors (F12 → Console).
3. Reload the page and watch for content script injection messages.

### Build errors

**Cause**: Missing dependencies or outdated Node version.

**Fixes**:

1. Run `npm install` again.
2. Confirm Node.js ≥ 18 (`node --version`).
3. Delete `node_modules/` and `package-lock.json`, then run `npm install` fresh.

---

## Testing in a clean environment

For reproducible testing, use a combination of:

1. **Separate Chrome profile** (isolates data).
2. **Incognito mode** (prevents interference from other extensions, but note: extensions don't run in incognito by default unless you enable it).
3. **Scenario Runner** (automated test flows to validate behavior).

**Code reference**: `src/sidepanel/views/scenario-runner-view.tsx` for test scenarios.
