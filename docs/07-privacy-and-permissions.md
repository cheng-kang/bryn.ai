## 07 — Privacy & Permissions

Bryn is built on **privacy by design**. All data processing happens locally on your device. Nothing is sent to external servers, and you have full control over your data.

---

## Privacy guarantees

### 1. On-device AI only

All AI runs locally using Chrome's built-in Gemini Nano model. No external API calls. No telemetry.

**What this means**:

- Your browsing data (page content, titles, URLs) never leaves your device.
- No cloud servers see your activity.
- No third-party services are involved.

**Trade-off**: Local AI is slower (4–15s per task) than cloud APIs, but privacy is non-negotiable.

### 2. Local data storage

All data is stored in your browser's IndexedDB:

- **Pages**: Content, metadata, interactions.
- **Intents**: Labels, summaries, insights.
- **Nudges**: Suggested actions.
- **Queue tasks**: Processing state.

**What this means**:

- Data lives only on this device.
- No sync to Chrome Sync or any cloud service (unless you explicitly export).
- Uninstalling the extension clears all data automatically.

### 3. No telemetry or analytics

Bryn does not collect usage statistics, crash reports, or any form of telemetry.

**What this means**:

- We don't know how many users install the extension.
- We don't know which features are used.
- We don't track errors or performance metrics in the wild.

**Why?** Because privacy means not just "we don't share your data" but "we don't collect it in the first place."

### 4. User control

You have full control over your data:

- **Export all data**: Download a JSON file with all pages, intents, nudges, and queue state.
- **Delete all data**: Wipe everything via the Settings view.
- **Edit insights**: Manually edit any label, summary, or intent.
- **Explain decisions**: Every suggestion has a "Why am I seeing this?" link that shows the reasoning.

**Code reference**: `src/sidepanel/views/backstage-view.tsx` (Settings actions).

---

## Extension permissions

Bryn requests the following permissions in `public/manifest.json`:

### storage, unlimitedStorage

**Why**: Store pages, intents, and queue state in IndexedDB without hitting the 10MB quota.

**What we access**: Only data Bryn creates (pages you visit, intents, nudges). No access to passwords, cookies, or other extension data.

### tabs, activeTab

**Why**: Know which tab is active to track page visits and inject the content script.

**What we access**: Tab URL, title, and active state. No access to tab content unless the content script is injected.

### scripting

**Why**: Inject the page tracker content script on web pages.

**What we access**: Page content (text, metadata, interactions) only after you visit a page. Script is injected at `document_idle` to avoid blocking page load.

### history

**Why**: Understand browsing context (e.g., referrer, visit frequency).

**What we access**: Visit history for pages you browse. Used to enrich page metadata (e.g., "first visit" vs. "returning").

### sidePanel

**Why**: Display the Bryn UI in the browser's side panel.

**What we access**: No data access. Just enables the side panel UI.

### alarms

**Why**: Schedule periodic background tasks (e.g., knowledge gap analysis, merge detection).

**What we access**: No data access. Just enables scheduling.

### host_permissions: `<all_urls>`

**Why**: Inject the content script on any web page you visit.

**What we access**: Page content (text, metadata, interactions) only on pages you actively visit.

**Limitations**: Content scripts do not run on `chrome://` or `extension://` pages by design (Chrome security policy).

**Code reference**: `public/manifest.json` lines 7–18 (permissions declaration).

---

## Data access scope

### What Bryn sees

- **URL and title** of pages you visit.
- **Page content**: Extracted text (scripts/styles stripped).
- **Metadata**: Domain, language, Open Graph tags, headings, links.
- **Interactions**: Scroll depth, dwell time, text selections (used for engagement scoring).

### What Bryn doesn't see

- **Passwords or form data** (unless it's visible text in the page body, which is anonymized during processing).
- **Other tabs** you have open (only the active tab when you visit it).
- **Incognito browsing** (unless you explicitly enable the extension in incognito mode).
- **Other extensions' data**.
- **Chrome settings or bookmarks**.

---

## Comparison to cloud-based tools

| Feature            | Bryn (Local)               | Cloud-based AI                |
| ------------------ | -------------------------- | ----------------------------- |
| Data leaves device | Never                      | Always                        |
| Privacy risk       | Zero (on-device only)      | High (server-side processing) |
| Latency            | 4–15s (AI execution)       | 500ms + network               |
| Works offline      | Yes (after model download) | No                            |
| Requires API key   | No                         | Yes                           |
| Cost               | Free                       | Pay per request               |

**Why Bryn chose local-only**: Privacy is a core principle. The user's browsing history is too sensitive to send to the cloud.

---

## Trial tokens and AI availability

Bryn includes **trial tokens** in `public/manifest.json` to enable Chrome's built-in AI APIs during development:

- **AIPromptAPIMultimodalInput**: Enables multimodal input (text + images).
- **AIProofreaderAPI**: Enables proofreading (not currently used).
- **AIRewriterAPI**: Enables rewriting (not currently used).
- **AIWriterAPI**: Enables writing (not currently used).

**What these do**: Unlock experimental AI features in Chrome 138+ before they're generally available.

**Expiry**: These tokens expire in late 2025. After expiry, Bryn will only work if Chrome has enabled built-in AI by default.

**Code reference**: `public/manifest.json` lines 46–51 (trial_tokens array).

---

## Scope boundaries

### Pages Bryn tracks

- Any `http://` or `https://` page you visit.
- Content script is injected at `document_idle` (after page load).

### Pages Bryn ignores

- `chrome://` pages (Chrome settings, flags, components).
- `extension://` pages (other extensions).
- `file://` pages (local files, unless explicitly permitted).
- Pages where the content script fails to inject (rare, usually CSP issues).

**Why?** Chrome security policy prevents extensions from accessing internal pages and other extensions.

---

## Data retention

### How long data is kept

- **Pages**: Forever (until you delete them manually or delete all data).
- **Intents**: Forever (until you delete them manually or delete all data).
- **Queue tasks**: 7 days (completed/failed tasks auto-delete to keep storage lean).
- **Nudges**: 30 days (or until dismissed/acted on).

### How to delete data

1. **Delete individual intents/pages**: Via Intent/Page Detail views.
2. **Delete all data**: Backstage → Settings → Delete All Data.
3. **Uninstall the extension**: Automatically clears all IndexedDB data.

---

## Security considerations

### XSS and injection

Bryn extracts text from page content but does not execute any user-provided JavaScript. All AI prompts are sanitized to prevent injection attacks.

### Data leakage

Bryn does not sync data to Chrome Sync or any cloud service. Export is manual only (JSON download).

### Third-party dependencies

Bryn uses open-source dependencies (React, Radix UI, Tailwind). All dependencies are vetted and bundled locally (no CDN links).

**Code reference**: `package.json` (dependencies list).

---

## Future privacy enhancements

Potential improvements (not yet implemented):

- **Encrypted storage**: Encrypt IndexedDB with a user-provided password.
- **Optional cloud sync**: Opt-in sync to Chrome Sync API with end-to-end encryption.
- **Data portability**: Import/export in standard formats (JSON-LD, CSV).
- **Granular permissions**: Let users disable specific features (e.g., interaction tracking).

---

## Trust and transparency

Bryn is open to inspection:

- **Source code**: Available in the repository. You can audit what the extension does.
- **Build process**: Reproducible. You can build from source and verify the output matches the distributed extension.
- **No obfuscation**: Code is readable (not minified or obfuscated beyond standard bundling).

**Code reference**: Full source in `src/` directory.

---

## Contact and concerns

If you have privacy concerns or questions:

1. Review the source code in `src/`.
2. Check the manifest permissions in `public/manifest.json`.
3. Run the extension in a separate Chrome profile for isolation.
4. Export your data and inspect the JSON to see exactly what's stored.

Bryn's privacy model is simple: **Everything stays local. Nothing leaves your device. You're in full control.**
