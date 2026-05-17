# Smart Drop — Chrome Extension Context Document

> Complete state as of last session. Give this to a new Claude/GPT session to continue seamlessly.

---

## What is Smart Drop?

A Chrome Extension (Manifest V3) that injects a **collapsible sidebar** onto every webpage with 3 tabs + Settings overlay:

| Tab | Function |
|-----|----------|
| **Vault** | Drag/drop files from OS or browser into IndexedDB. Drag files back out onto web pages. Click-to-upload fallback. |
| **Drive** | OAuth2 → Google Drive API → browse folder → click file for detail view with preview + "Open in Drive" button |
| **AI** | Chat with OpenAI/Anthropic/Gemini. Right-click text → "Summarize with Smart Drop AI" |
| **Settings** (gear icon) | Theme toggle (Dark/Light), AI Provider, API Key, Clear Vault button |

**Collapsed state:** 8px×120px vertical strip attached to right edge of browser. Click to expand.

---

## Architecture

```
manifest.json (MV3)
  ├── content_scripts: content.js on <all_urls>
  ├── service_worker: background.js
  │     ├── OAuth2 (Google Drive read-only)
  │     ├── Permissions: storage, identity, contextMenus
  │     └── Hosts: googleapis.com, api.openai.com, api.anthropic.com, generativelanguage.googleapis.com
  └── web_accessible_resources: sidebar.css only

content.js ←────→ background.js (chrome.runtime.sendMessage / chrome.tabs.sendMessage)
    │
    └── Shadow DOM → sidebar.css (dark + light theme CSS variables)
```

---

## File-by-File Detail

### `manifest.json`

| Key | Value |
|-----|-------|
| manifest_version | 3 |
| background | service_worker: background.js, type: module |
| content_scripts | content.js on `<all_urls>`, run_at: document_idle |
| oauth2.client_id | `752069116379-rgmrc9agjko41l17r489mrr5o5rteitt.apps.googleusercontent.com` |
| oauth2.scopes | `https://www.googleapis.com/auth/drive.readonly` |
| permissions | storage, identity, activeTab, scripting, contextMenus |
| host_permissions | googleapis.com, api.openai.com, api.anthropic.com, generativelanguage.googleapis.com |
| web_accessible_resources | sidebar.css only (sidebar.html removed — UI in JS) |

### `background.js`

**Context menu:** Creates `"Summarize with Smart Drop AI"` on text selection. Sends `AI_SUMMARIZE` message to content script.

**OAuth2:** `chrome.identity.getAuthToken({ interactive: true })` via `OPEN_AUTH_WINDOW` message from content.

**AI API relay (`AI_REQUEST`):** Receives `{ provider, apiKey, prompt, text }` from content, routes to:

| Provider | Endpoint | Model | Response parsing |
|----------|----------|-------|-----------------|
| `openai` | `https://api.openai.com/v1/chat/completions` | `gpt-4o` | `response.choices[0].message.content` |
| `anthropic` | `https://api.anthropic.com/v1/messages` | `claude-3-5-sonnet-20241022` | `response.content[0].text` |
| `google` | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=APIKEY` | `gemini-2.0-flash` | `response.candidates[0].content.parts[0].text` |

Anthropic uses `system` field (Claude-specific). Gemini uses `system_instruction.parts`. OpenAI uses system message in messages array.

### `sidebar.css`

**Dual theme system via CSS custom properties on `:host`:**

| Variable | Dark | Light |
|----------|------|-------|
| `--bg-base` | `#1c1c1e` | `#f2f2f7` |
| `--bg-elevated` | `#2c2c2e` | `#ffffff` |
| `--bg-card` | `#1a1a1a` | `#ffffff` |
| `--bg-input` | `#141414` | `#f5f5f5` |
| `--border` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.1)` |
| `--text-primary` | `#ffffff` | `#1c1c1e` |
| `--text-secondary` | `rgba(255,255,255,0.6)` | `rgba(0,0,0,0.55)` |
| `--text-tertiary` | `rgba(255,255,255,0.4)` | `rgba(0,0,0,0.35)` |
| `--fill-secondary` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.06)` |
| `--fill-tertiary` | `rgba(255,255,255,0.04)` | `rgba(0,0,0,0.03)` |
| `--accent` | `#ffffff` | `#007aff` |
| `--danger` | `#ff453a` | `#ff3b30` |
| `--success` | `#30d158` | `#34c759` |
| `--apple-ease` | `cubic-bezier(0.4, 0, 0.2, 1)` (Apple standard deceleration) |

Theme set via `host.host.setAttribute('data-theme', 'dark'|'light')` from content.js. Persisted in `chrome.storage.local.smartDropTheme`.

**CSS Layout Chain for scrolling:**
```
#smart-drop-sidebar (flex col, 88vh, max 750px, overflow:hidden)
 └── #sidebar-content (flex col, height:100%)
      ├── .sidebar-header (flex-shrink:0)
      ├── .sidebar-tabs (flex-shrink:0)
      └── .tab-panels (flex:1, flex col, min-height:0, overflow:hidden) ← CONSTRAINS PANELS
           ├── #vault-panel (pads, overflow-y:auto + overscroll-behavior:contain)
           ├── #drive-panel (flex col, overflow:hidden)
           │   ├── .drive-config (flex-shrink:0)
           │   ├── #drive-status (flex-shrink:0)
           │   ├── #drive-list (flex:1, overflow-y:auto + overscroll-behavior:contain) ← scrolls
           │   └── #drive-detail (flex col, hidden until clicked)
           └── #ai-panel (flex col)
                ├── .ai-output (flex:1, overflow-y:auto + overscroll-behavior:contain)
                └── .ai-input-area (flex-shrink:0)
```

**Delete button styling:** Absolute-positioned 22px circle overlay on `.file-card` top-right. `backdrop-filter: blur(8px)` frosted glass. `transform: scale(0.8)` → `scale(1)` on hover, `scale(1.1)` when hovered directly. Background turns `var(--danger)` on hover.

**Settings overlay:** Slides in from right via `transform: translateX(100%)` → `translateX(0)` on `.open` class. iOS-style toggle switch with pseudo-element knob.

### `content.js`

**Main UI variables:**
```js
let sidebarOpen = false;
let isDraggingFromSidebar = false;
let currentDraggedFile = null;
let currentTheme = 'dark';   // persisted
let aiProvider = 'openai';   // persisted
let aiKey = '';              // persisted
let driveToken = null;
let driveFileCache = [];     // cached drive files for detail view
```

**DB:** `const DB_NAME = 'SmartDropDB_v2'`, store: `'vault'`, keyPath: `'id'`, autoIncrement.

**Important note:** IndexedDB opened from content script uses the **web page's origin**, not the extension's. Files saved on `example.com` won't appear on `google.com`. This is a known limitation. A future improvement would be to migrate to `chrome.storage.local`.

**Initialization flow:**
1. Create Shadow DOM container
2. Inject `sidebar.css` link
3. Build sidebar HTML via `host.innerHTML +=`
4. Attach all event listeners  
5. `initDB()` → `renderVault()` → load `chrome.storage.local.get(['driveFolderId','aiKey','aiProvider','smartDropTheme'])`

**Click outside closes:** `document.addEventListener('click', ...)` checks `e.composedPath().includes(sidebar)`. Shadow DOM traversal works via `composedPath()`.

**Scroll isolation:** `sidebar.addEventListener('wheel', ...)` with `{passive:false}` checks `target.closest('#vault-panel, #drive-list, #drive-detail, .ai-output, .settings-body')`. Only calls `e.stopPropagation()` when there's remaining scroll room in that direction.

**Vault drop zone:**
- `dropZone.addEventListener('click')` → opens hidden `<input type="file" multiple>`
- File input change → `saveFile()` for each file
- `['dragenter','dragover','dragleave','drop'].forEach()` prevents default on drop zone
- Drop handler: checks `e.dataTransfer.files` first, then checks `text/html` for `<img>` URLs (Chrome-internal drag), then checks `text/plain` for HTTP or data: URLs. Fetches remote images via `fetchImageFromUrl()` with CORS.

**Auto-expand on drag:** `document.addEventListener('dragenter')` checks if cursor is within 80px of right edge → expands sidebar + switches to Vault tab.

**Vault-to-page drop:** Converts IndexedDB dataURL back to Blob via `dataURLtoBlob()`, creates `File` + `DataTransfer`, dispatches synthetic `DragEvent('drop')` on target. If target is a file input, directly sets `.files` + dispatches `change` event.

**Drive flow:**
1. User pastes folder URL → extracts folder ID via regex
2. `chrome.storage.local.set({driveFolderId})` → `loadDriveFiles(folderId)`
3. `chrome.runtime.sendMessage({action:"OPEN_AUTH_WINDOW"})` → OAuth2 in background
4. `fetchDriveFiles(token, folderId)` → Google Drive API v3 list query with `webViewLink, webContentLink, size, modifiedTime` fields
5. `renderDriveGrid()` → 2-column grid of `.file-card` with thumbnails
6. Click file → `showDriveDetail(file)` → detail panel with thumbnail, metadata, preview (images use `webContentLink`, others use upscaled thumbnail s800), "Open in Google Drive" button
7. Back button → `hideDriveDetail()` → grid visible again

**AI chat:**
- `#send-ai` click → validates API key presence → `chrome.runtime.sendMessage({action:"AI_REQUEST"})`
- Response parsing differs per provider (see background.js section)
- Markdown code blocks: ``` replaced with `<pre><code>` tags
- Enter key submits, Shift+Enter for newline
- Right-click "Summarize" → forces sidebar open, switches to AI tab, sends selected text

**Clear Vault:** Settings → "Clear Vault" button → `confirm()` → `db.transaction(...).objectStore(STORE_NAME).clear()` → `renderVault()`

**Vault refresh:** 🔄 button in vault-toolbar calls `renderVault()`. Also auto-renders on pill click expand and on tab switch to vault.

---

## Known Issues & Future Improvements

1. **IndexedDB origin-scoped:** Files saved on one domain won't appear on another. Migrate to `chrome.storage.local` for cross-origin vault.
2. **Drive detail scroll:** `#drive-detail` currently inside `#drive-panel` with `overflow:hidden`; detail panel has `overflow-y:auto` but may conflict with panel's `overflow:hidden`. Monitor.
3. **`host.innerHTML +=` fragility:** Destroys and recreates all DOM including CSS link. Works but causes re-fetch. Consider building DOM programmatically with `createElement`.
4. **No error recovery for failed Drive token refresh:** If OAuth token expires, user must re-click "Link".
5. **Light mode delete button:** Uses hardcoded `background: rgba(0,0,0,0.6)` regardless of theme — still looks fine since it's on top of card preview.

---

## How to Continue in a New Chat

1. Read all 4 source files: `manifest.json`, `background.js`, `sidebar.css`, `content.js`
2. Read this `CONTEXT.md`
3. Focus on the "Known Issues" section above for improvement targets
4. The CSS uses `var(--*)` everywhere — when adding UI, use existing variables or add new ones to both `:host` and `:host([data-theme="light"])` blocks
5. Event listeners are all inside the Shadow DOM via `host.getElementById()` — DOM refs are at the top after sidebar HTML injection