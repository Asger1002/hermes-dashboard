# Hermes WebUI Dashboard Plugin — Native Refactor Plan

> **Supersedes:** `.hermes/plans/hermes-webui-dashboard-plugin.md` (the old iframe-based plan)
> **Goal:** Rebuild the plugin as native React components using the Hermes Dashboard Plugin SDK, removing all dependency on the reference WebUI server and its Python backend.

## Architecture Decision

**Old approach (BAD):** Plugin embeds the reference WebUI in an iframe. Requires a separate `server.py` Python process to run. `plugin_api.py` manages starting/stopping that server and proxies API calls. Uses code from the `hermes_webui_reference/` directory.

**New approach (GOOD):**
1. All UI built natively with the Dashboard Plugin SDK (React, hooks, shadcn/ui components)
2. All management APIs called directly from JS via `SDK.api` — no proxy needed
3. A **minimal** `plugin_api.py` adds ONLY the endpoints the dashboard lacks (session creation, streaming chat)
4. Zero code used from `hermes_webui_reference/` — that directory remains read-only reference only
5. No separate server process — `plugin_api.py` is auto-mounted into the existing dashboard FastAPI app

**Why this works:**
- The dashboard already exposes 40+ API endpoints for management (sessions, config, models, profiles, skills, cron, analytics, logs, etc.)
- The dashboard only lacks session creation and streaming chat — those we add via `plugin_api.py`
- The Plugin SDK provides React, hooks, shadcn/ui components, and typed API client — everything needed for a rich UI

---

## What the Dashboard API Already Provides

| Feature | Dashboard API | SDK method |
|---------|--------------|------------|
| Session list | `GET /api/sessions` | `api.getSessions()` |
| Session search | `GET /api/sessions/search` | `api.searchSessions()` |
| Session detail | `GET /api/sessions/:id` | (via fetchJSON) |
| Session messages | `GET /api/sessions/:id/messages` | `api.getSessionMessages()` |
| Session delete | `DELETE /api/sessions/:id` | `api.deleteSession()` |
| Config (view/save) | `GET/PUT /api/config` | `api.getConfig()`, `api.saveConfig()` |
| Config YAML | `GET/PUT /api/config/raw` | `api.getConfigRaw()`, `api.saveConfigRaw()` |
| Config schema | `GET /api/config/schema` | `api.getSchema()` |
| Env vars | `GET/PUT/DELETE /api/env` | `api.getEnvVars()`, etc. |
| Model info | `GET /api/model/info` | `api.getModelInfo()` |
| Model options | `GET /api/model/options` | `api.getModelOptions()` |
| Model set | `POST /api/model/set` | `api.setModelAssignment()` |
| Profiles | `GET/POST/PATCH/DELETE /api/profiles` | `api.getProfiles()`, etc. |
| Skills | `GET /api/skills` | `api.getSkills()` |
| Skills toggle | `PUT /api/skills/toggle` | `api.toggleSkill()` |
| Toolsets | `GET /api/tools/toolsets` | `api.getToolsets()` |
| Cron jobs | Full CRUD at `/api/cron/jobs` | `api.getCronJobs()`, etc. |
| Analytics | `GET /api/analytics/usage` | `api.getAnalytics()` |
| Logs | `GET /api/logs` | `api.getLogs()` |
| Status | `GET /api/status` | `api.getStatus()` |
| OAuth providers | Full flow at `/api/providers/oauth` | `api.getOAuthProviders()`, etc. |
| Gateway restart | `POST /api/gateway/restart` | `api.restartGateway()` |
| Hermes update | `POST /api/hermes/update` | `api.updateHermes()` |
| Themes | `GET /api/dashboard/themes` | `api.getThemes()` |

## What We Need to ADD via plugin_api.py

| Feature | Endpoint |
|---------|----------|
| Create session | `POST /api/plugins/hermes-webui/sessions` |
| Start chat (SSE) | `POST /api/plugins/hermes-webui/chat/start` |
| Stream chat events | `GET /api/plugins/hermes-webui/chat/stream/:stream_id` |
| Cancel chat | `POST /api/plugins/hermes-webui/chat/cancel/:stream_id` |
| File browser (workspace) | `GET /api/plugins/hermes-webui/files` |
| File read | `GET /api/plugins/hermes-webui/files/content` |

---

## Plugin Directory Layout (target)

```
~/.hermes/plugins/hermes-webui/
├── plugin.yaml                              # CLI/gateway extension manifest
├── __init__.py                              # REQUIRED — plugin loader check
├── dashboard/
│   ├── manifest.json                        # Tab registration
│   ├── plugin_api.py                        # Minimal: session create + chat streaming
│   └── dist/
│       └── index.js                         # Native React UI (IIFE, uses Plugin SDK)
```

---

## Epics & Tasks

### Epic 1: Clean Slate (P0) — Remove old iframe approach
**Bead: hermes-dashboard-CLEAN (epic)**

**Tasks:**
- **CLEAN-1** — Strip `plugin_api.py` to skeleton: remove webui server management, remove proxy endpoint, remove theme/auth stubs. Keep only the FastAPI router scaffold.
- **CLEAN-2** — Rewrite `dist/index.js` as skeleton IIFE: register placeholder WebUIPage component. Remove all iframe code, server start/stop UI, error states that assume a server.
- **CLEAN-3** — Remove `dist/style.css` (will rebuild styles natively via Tailwind classes and SDK utils.cn)
- **CLEAN-4** — Update `manifest.json`: remove `"css"` field (CLEAN-3 removes file), keep `"entry"`, `"api"`, `"tab"`. Add `"slots": []`

### Epic 2: Session Management UI (P0) — Build native session components
**Bead: hermes-dashboard-SESS (epic)**

**Tasks:**
- **SESS-1** — Build `SessionList` component: fetches sessions via `SDK.api.getSessions()`, renders list with title, model, timestamp, preview. Uses SDK Card, Badge components. Supports pagination.
- **SESS-2** — Build `SessionSearch` component: search input that calls `SDK.api.searchSessions()`, renders results.
- **SESS-3** — Build `SessionHeader` component: shows active session title, model badge, message count. Injects into dashboard slot if possible.
- **SESS-4** — Build session actions: delete (with confirm dialog), create new (via plugin_api.py POST /sessions).
- **SESS-5** — Wire session components together in main WebUIPage: session list on left, detail on right.

### Epic 3: Backend Session + Chat (P0) — Minimal plugin_api.py
**Bead: hermes-dashboard-API (epic)**

**Tasks:**
- **API-1** — Implement `POST /api/plugins/hermes-webui/sessions`: creates a new session via `hermes_state.SessionDB`, returns session_id + metadata. Accepts workspace, model params.
- **API-2** — Implement `POST /api/plugins/hermes-webui/chat/start`: receives session_id + user message, spawns agent in background thread with SSE streaming via queue. Returns stream_id.
- **API-3** — Implement `GET /api/plugins/hermes-webui/chat/stream/{stream_id}`: SSE endpoint. Streams token deltas, tool calls, approval events, and done/error from the agent queue. Heartbeat keepalive.
- **API-4** — Implement `POST /api/plugins/hermes-webui/chat/cancel/{stream_id}`: cancels a running agent stream by setting interrupt flag.
- **API-5** — Implement `GET /api/plugins/hermes-webui/files` and `GET /api/plugins/hermes-webui/files/content`: file browser for session workspace (list dir, read file content).

### Epic 4: Chat Interface UI (P0) — Messages, input, streaming
**Bead: hermes-dashboard-CHAT (epic)**

**Tasks:**
- **CHAT-1** — Build `MessageList` component: renders array of messages (user/assistant/system/tool roles). Each message gets role badge, timestamp, content.
- **CHAT-2** — Build `MarkdownRenderer` utility: converts markdown text to React elements. Handles code blocks (fenced + inline), headings, lists, links, bold/italic. Uses CSS classes compatible with dashboard theme.
- **CHAT-3** — Build `MessageComposer` component: text input (textarea with auto-resize), send button. Supports Shift+Enter for newline, Enter to send.
- **CHAT-4** — Build `StreamingChat` component: connects to SSE endpoint via EventSource. Accumulates token deltas into evolving message. Shows thinking state, tool call display.
- **CHAT-5** — Wire chat into WebUIPage: session selection loads messages into MessageList, composer sends new messages, StreamingChat handles live responses.

### Epic 5: Model & Provider Management (P1)
**Bead: hermes-dashboard-MODL (epic)**

**Tasks:**
- **MODL-1** — Build `ModelSelector` component: fetches models via `api.getModelOptions()`, renders dropdown/select using SDK Select component. Shows current model, provider badge.
- **MODL-2** — Build `ProviderInfo` component: displays configured providers, OAuth status, model cache.
- **MODL-3** — Wire model selection into new-session flow and session header.

### Epic 6: Config & Settings Panels (P1)
**Bead: hermes-dashboard-CONF (epic)**

**Tasks:**
- **CONF-1** — Build `ConfigViewer` component: fetches and displays config YAML via `api.getConfigRaw()`, with edit capability.
- **CONF-2** — Build `EnvVarsViewer` component: displays env vars via `api.getEnvVars()`, with masked values and add/set/delete actions.
- **CONF-3** — Build `SettingsPanel` tab using SDK Tabs component to group config, env, models.

### Epic 7: Additional Panels (P1)
**Bead: hermes-dashboard-PNLS (epic)**

**Tasks:**
- **PNLS-1** — Build `SkillsPanel`: fetches skills via `api.getSkills()`, renders list with toggle enabled/disabled.
- **PNLS-2** — Build `ProfilesPanel`: fetches profiles via `api.getProfiles()`, renders list with create/rename/delete actions.
- **PNLS-3** — Build `CronPanel`: fetches jobs via `api.getCronJobs()`, renders list with pause/resume/trigger/delete actions.
- **PNLS-4** — Build `AnalyticsPanel`: fetches via `api.getAnalytics()`, renders charts/stats.
- **PNLS-5** — Build `LogsPanel`: fetches via `api.getLogs()`, renders scrollable log viewer with level filter.

### Epic 8: Polish & Integration (P1)
**Bead: hermes-dashboard-POL (epic)**

**Tasks:**
- **POL-1** — Build `WebUIPage` main component: assembles all sub-components into a coherent layout. Uses SDK Tabs for section navigation (Chat, Sessions, Config, Skills, etc.).
- **POL-2** — Theme-aware styling: all components use dashboard CSS variables and SDK utils.cn for consistent look.
- **POL-3** — Loading states: skeleton/spinner for all async data fetches.
- **POL-4** — Error states: toast notifications, inline errors, retry buttons.
- **POL-5** — Responsive layout: collapse sidebar on mobile, adjust layout.
- **POL-6** — Update `manifest.json` with final metadata, description, version bump.

---

## Execution Strategy — Parallel Workstreams

### Wave 1 (independent — deploy opencode workers in parallel):
- [Worker A] CLEAN-1: Strip plugin_api.py to skeleton
- [Worker B] CLEAN-2: Rewrite dist/index.js skeleton
- [Worker C] SESS-1: Build SessionList component
- [Worker D] API-1: Implement POST /sessions endpoint

### Wave 2 (after Wave 1):
- [Worker A] API-2 + API-3: Chat start + SSE streaming endpoints (after API-1)
- [Worker B] CHAT-1 + CHAT-2: MessageList + MarkdownRenderer (after CLEAN-2)
- [Worker C] SESS-2 + SESS-3: SessionSearch + SessionHeader (after SESS-1)
- [Worker D] API-5: File browser API (after API-1)

### Wave 3 (after Wave 2):
- [Worker A] CHAT-3 + CHAT-4: MessageComposer + StreamingChat
- [Worker B] SESS-4 + SESS-5: Session actions + wiring
- [Worker C] API-4: Cancel chat endpoint
- [Worker D] MODL-1 + MODL-2: ModelSelector + ProviderInfo

### Wave 4 (after Wave 3):
- [Worker A] MODL-3: Wire model selection
- [Worker B] CONF-1 + CONF-2 + CONF-3: Config viewer, env vars, settings panel
- [Worker C] PNLS-1 + PNLS-2: Skills panel + Profiles panel
- [Worker D] PNLS-3 + PNLS-4 + PNLS-5: Cron, Analytics, Logs panels

### Wave 5 (after Wave 4):
- [Worker A] POL-1: Assemble WebUIPage main component
- [Worker B] POL-2: Theme-aware styling
- [Worker C] POL-3 + POL-4: Loading + error states
- [Worker D] POL-5 + POL-6: Responsive + manifest update

---

## Key Constraints

1. **ZERO code from `hermes_webui_reference/`.** That directory is read-only reference. No imports, no copying, no referencing its files in our code.
2. **No separate server process.** `plugin_api.py` runs inside the dashboard's existing FastAPI app. No `subprocess.Popen` for a webui server.
3. **SDK-first.** All JS uses `window.__HERMES_PLUGIN_SDK__` (React, hooks, components, api, utils). No bundler, no npm, no imports. Output is a single IIFE file.
4. **Dashboard API first.** Prefer `SDK.api.*` methods over custom fetchJSON calls. Only use `fetchJSON` for our own plugin_api.py routes.
5. **Theme-aware.** All inline styles and CSS use dashboard CSS variables (`var(--color-*)`, `var(--font-*)`, `var(--radius)`, etc.).
6. **One IIFE file.** All JS code goes into `dist/index.js`. No splitting across files — the plugin SDK registers one component.

---

## Reference: Plugin SDK Surface

```javascript
// Available on window
const SDK = window.__HERMES_PLUGIN_SDK__;

SDK.React          // React object (createElement, Fragment, etc.)
SDK.hooks          // { useState, useEffect, useCallback, useMemo, useRef, useContext, createContext }
SDK.components     // { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Label,
                   //   Select, SelectOption, Separator, Tabs, TabsList, TabsTrigger, PluginSlot }
SDK.api            // Typed API client (getSessions, getSessionMessages, getConfig, etc.)
SDK.fetchJSON      // Raw fetchJSON for plugin-specific endpoints
SDK.utils          // { cn, timeAgo, isoTimeAgo }
SDK.useI18n        // Internationalization hook

// Registration
window.__HERMES_PLUGINS__.register("hermes-webui", Component);
window.__HERMES_PLUGINS__.registerSlot("hermes-webui", "slot:name", Component);
```

## Reference: plugin_api.py Template

```python
from fastapi import APIRouter

router = APIRouter()

# Routes are auto-mounted at /api/plugins/hermes-webui/
# Access from JS: SDK.fetchJSON("/api/plugins/hermes-webui/status")

@router.get("/status")
async def get_status():
    return {"ok": True, "version": "2.0.0"}
```

---

## Troubleshooting

- **Plugin tab not showing:** Check `manifest.json` at `~/.hermes/plugins/hermes-webui/dashboard/manifest.json`. Run `curl http://127.0.0.1:9119/api/dashboard/plugins/rescan`. Check browser console for JS errors.
- **Backend routes 404:** Confirm `"api": "plugin_api.py"` in manifest. Restart dashboard (API routes mount at startup, not on rescan).
- **JS bundle errors:** Check browser console for `window.__HERMES_PLUGINS__ is undefined`. Verify bundle calls `register()` with same name as manifest `name` field.
- **SDK.api methods undefined:** Ensure you're accessing `SDK.api.getSessions()` not `api.getSessions()` directly.
