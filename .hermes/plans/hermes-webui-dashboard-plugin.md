# Hermes WebUI Dashboard Plugin — Implementation Plan

> **For Hermes Agents:** Use `bd ready` to find available work. Each task below maps to a bead.
> Always run `bd prime` before starting, `bd update <id> --claim` before working, and `bd close <id>` when done.

**Goal:** Build the Hermes WebUI (classic vanilla-JS SPA) into the Hermes Dashboard as a drop-in plugin, making the webui accessible from a dashboard tab via iframe embedding with progressive enhancement toward deeper integration.

**Architecture:** The plugin wraps the existing webui server in an iframe within the React dashboard. A Python backend (`plugin_api.py`) detects the running webui, manages its lifecycle, and optionally proxies API calls. A minimal React component renders the iframe with loading/error states. Phase 1 delivers basic iframe embedding (MVP). Phase 2 adds embedded serving and API bridging. Phase 3 adds theme sync and auth passthrough.

**Tech Stack:** Python (FastAPI for plugin backend), JavaScript (React via Plugin SDK for frontend), CSS (theme-aware variables), Bash (deployment scripts)

**Key Reference Files:**
- Dashboard plugin system docs: `reference_extending-the-dashboard.md` (in repo root)
- Reference webui source: `hermes_webui_reference/` (gitignored, read-only reference)
- Architecture doc: `hermes_webui_reference/ARCHITECTURE.md`
- WebUI server: `hermes_webui_reference/server.py` (plain http.server, runs on configurable port)
- WebUI JS entry: `hermes_webui_reference/static/index.html` (subpath-mountable via `<base>` tag)

**Plugin Directory Layout (target):**
```
~/.hermes/plugins/hermes-webui/
├── plugin.yaml                          # CLI/gateway extension manifest
├── dashboard/
│   ├── manifest.json                    # Tab, icon, entry point, CSS, API
│   ├── dist/
│   │   ├── index.js                     # React component (IIFE, uses Plugin SDK)
│   │   └── style.css                    # Full-viewport iframe styles
│   └── plugin_api.py                    # Backend: detection, lifecycle, config
└── webui/                               # Phase 2: bundled webui static files
```

---

## Architecture Decision: Iframe vs Embedded

The webui is a complete standalone SPA with 146+ API routes, vanilla JS (no React), and its own Python HTTP server. Rewriting it as React components would be a multi-month effort. The dashboard plugin system expects React components registered via `window.__HERMES_PLUGINS__.register()`.

**Decision: Phase 1 uses iframe embedding.** The webui runs as its own process; the plugin provides a dashboard tab with a full-viewport iframe pointing to `http://127.0.0.1:<webui-port>`. The plugin backend detects the webui and provides the URL to the frontend.

**Why this works:**
1. Zero modification to existing webui code
2. The webui already supports subpath mounting (dynamic `<base>` tag in index.html:17)
3. Dashboard plugin SDK is used minimally (just `React`, `Card`, `Button`, `SDK.fetchJSON`)
4. Progressive enhancement path: Phase 2 can bundle webui static files into the plugin for self-contained serving

**Known trade-off:** Cross-origin iframe limitations (no JS access between dashboard and webui). Phase 3 addresses this with postMessage bridge or API proxying.

---

## Phase 1: MVP — Basic Iframe Integration (P0 tasks)

### Epic: Plugin Foundation (hermes-dashboard-uhb)

#### Task: Create plugin directory structure (hermes-dashboard-nrd) — READY
**Files to create:**
```
~/.hermes/plugins/hermes-webui/dashboard/
~/.hermes/plugins/hermes-webui/dashboard/dist/
```

```bash
mkdir -p ~/.hermes/plugins/hermes-webui/dashboard/dist
```

**Verification:** `ls ~/.hermes/plugins/hermes-webui/dashboard/` shows the directory.

#### Task: Create manifest.json (hermes-dashboard-76r) — BLOCKED by nrd
**Create:** `~/.hermes/plugins/hermes-webui/dashboard/manifest.json`

```json
{
  "name": "hermes-webui",
  "label": "WebUI",
  "description": "Classic Hermes WebUI interface embedded in the dashboard",
  "icon": "Globe",
  "version": "1.0.0",
  "tab": {
    "path": "/webui",
    "position": "end"
  },
  "entry": "dist/index.js",
  "css": "dist/style.css",
  "api": "plugin_api.py"
}
```

**Key decisions:**
- `tab.position: "end"` — adds WebUI tab at the end of the nav bar
- `tab.path: "/webui"` — accessible at dashboard URL `/webui`
- `icon: "Globe"` — uses Lucide Globe icon (mapped in dashboard)
- `api: "plugin_api.py"` — backend routes at `/api/plugins/hermes-webui/`

#### Task: Create plugin.yaml (hermes-dashboard-dxy) — READY
**Create:** `~/.hermes/plugins/hermes-webui/plugin.yaml`

Minimal CLI/gateway extension manifest for compatibility:

```yaml
name: hermes-webui
version: "1.0.0"
description: "Hermes WebUI dashboard plugin"
```

#### Task: Create dist/ stubs (hermes-dashboard-007) — BLOCKED by nrd
**Create:** `~/.hermes/plugins/hermes-webui/dashboard/dist/index.js` (empty placeholder)
**Create:** `~/.hermes/plugins/hermes-webui/dashboard/dist/style.css` (empty placeholder)

### Epic: Backend API Bridge (hermes-dashboard-ok8)

#### Task: Implement /api/plugins/hermes-webui/status (hermes-dashboard-2e6) — READY
**Create/Modify:** `~/.hermes/plugins/hermes-webui/dashboard/plugin_api.py`

Implements a FastAPI router with a single endpoint:

```python
from fastapi import APIRouter
from pathlib import Path

router = APIRouter()

# Configuration — edit this to match your webui setup
WEBUI_DEFAULT_PORT = 8080
WEBUI_HOST = "127.0.0.1"

@router.get("/status")
async def get_status():
    """Return webui server status and URL."""
    import socket
    
    # Probe the webui server
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.5)
    try:
        result = sock.connect_ex((WEBUI_HOST, WEBUI_DEFAULT_PORT))
        running = result == 0
    except Exception:
        running = False
    finally:
        sock.close()
    
    # Try common alternative ports if default is down
    alt_ports = []
    if not running:
        for port in [8081, 8082, 8888, 5000]:
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(0.3)
                if s.connect_ex((WEBUI_HOST, port)) == 0:
                    alt_ports.append(port)
                s.close()
            except Exception:
                pass
    
    return {
        "running": running,
        "url": f"http://{WEBUI_HOST}:{WEBUI_DEFAULT_PORT}" if running else None,
        "port": WEBUI_DEFAULT_PORT if running else None,
        "alternative_ports": alt_ports,
    }
```

#### Task: Implement /api/plugins/hermes-webui/config (hermes-dashboard-sbm) — READY
**Modify:** `~/.hermes/plugins/hermes-webui/dashboard/plugin_api.py`

Add a config endpoint:

```python
@router.get("/config")
async def get_config():
    """Return plugin configuration including webui URL and capabilities."""
    status = await get_status()
    return {
        "webui_url": status["url"],
        "running": status["running"],
        "version": "1.0.0",
        "capabilities": {
            "embedded": False,       # Phase 2
            "theme_sync": False,     # Phase 3
            "auth_passthrough": False,  # Phase 3
        }
    }
```

#### Task: Implement webui server detection (hermes-dashboard-dak) — BLOCKED by 2e6
**Modify:** `~/.hermes/plugins/hermes-webui/dashboard/plugin_api.py`

Refactor the port probing into a reusable utility function:

```python
import os
import subprocess
from pathlib import Path

def find_webui_process():
    """Find running webui server.py processes."""
    try:
        result = subprocess.run(
            ["pgrep", "-f", "server.py"],
            capture_output=True, text=True, timeout=2
        )
        return result.stdout.strip().split("\n") if result.stdout.strip() else []
    except Exception:
        return []

def find_webui_port():
    """Scan common ports for webui server."""
    # Try well-known ports first
    for port in [8080, 8081, 8888, 5000]:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.3)
        try:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                s.close()
                return port
        except Exception:
            pass
        finally:
            s.close()
    return None
```

#### Task: Implement server lifecycle management (hermes-dashboard-30w) — BLOCKED by dak
**Modify:** `~/.hermes/plugins/hermes-webui/dashboard/plugin_api.py`

Add start/stop endpoints for managing the webui server:

```python
WEBUI_REPO_PATH = os.path.expanduser("~/Drive/Projects/hermes-dashboard/hermes_webui_reference")
_webui_process = None

@router.post("/start")
async def start_webui():
    """Start the webui server."""
    global _webui_process
    if _webui_process and _webui_process.poll() is None:
        return {"status": "already_running", "pid": _webui_process.pid}
    
    if not os.path.isdir(WEBUI_REPO_PATH):
        return {"status": "error", "message": "WebUI repo not found"}
    
    try:
        _webui_process = subprocess.Popen(
            ["python3", "server.py"],
            cwd=WEBUI_REPO_PATH,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"status": "started", "pid": _webui_process.pid}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/stop")
async def stop_webui():
    """Stop the webui server."""
    global _webui_process
    if _webui_process and _webui_process.poll() is None:
        _webui_process.terminate()
        try:
            _webui_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _webui_process.kill()
            _webui_process.wait()
        return {"status": "stopped"}
    return {"status": "not_running"}
```

### Epic: Frontend Dashboard Integration (hermes-dashboard-41o)

#### Task: Create React component WebUIPage (hermes-dashboard-id3) — BLOCKED by 2e6
**Create/Modify:** `~/.hermes/plugins/hermes-webui/dashboard/dist/index.js`

Minimal React component using the Plugin SDK:

```javascript
(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) {
    console.error("[hermes-webui] Plugin SDK not available");
    return;
  }

  const { React } = SDK;
  const { useState, useEffect } = SDK.hooks;
  const { Card, CardContent, Button } = SDK.components;
  const { fetchJSON } = SDK;

  function WebUIPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [webuiUrl, setWebuiUrl] = useState(null);
    const [starting, setStarting] = useState(false);

    useEffect(function () {
      fetchJSON("/api/plugins/hermes-webui/config")
        .then(function (config) {
          if (config.webui_url) {
            setWebuiUrl(config.webui_url);
            setLoading(false);
          } else {
            setError("WebUI server is not running");
            setLoading(false);
          }
        })
        .catch(function (err) {
          setError("Failed to connect to WebUI plugin backend: " + err.message);
          setLoading(false);
        });
    }, []);

    function handleStart() {
      setStarting(true);
      fetchJSON("/api/plugins/hermes-webui/start", { method: "POST" })
        .then(function (result) {
          if (result.status === "started" || result.status === "already_running") {
            // Poll for readiness
            setTimeout(function () {
              fetchJSON("/api/plugins/hermes-webui/config")
                .then(function (config) {
                  if (config.webui_url) {
                    setWebuiUrl(config.webui_url);
                    setError(null);
                    setLoading(false);
                  }
                  setStarting(false);
                })
                .catch(function () {
                  setStarting(false);
                });
            }, 2000);
          } else {
            setError("Failed to start WebUI: " + (result.message || "unknown error"));
            setStarting(false);
          }
        })
        .catch(function (err) {
          setError("Failed to start WebUI: " + err.message);
          setStarting(false);
        });
    }

    if (loading) {
      return React.createElement(Card, { className: "webui-loading" },
        React.createElement(CardContent, null,
          React.createElement("div", { className: "webui-spinner" },
            React.createElement("p", null, "Connecting to WebUI...")
          )
        )
      );
    }

    if (error) {
      return React.createElement(Card, { className: "webui-error" },
        React.createElement(CardContent, null,
          React.createElement("h3", null, "WebUI Unavailable"),
          React.createElement("p", null, error),
          React.createElement("p", { className: "webui-help" },
            "Make sure the Hermes WebUI server is running. ",
            "Start it with: python3 server.py from the webui directory."
          ),
          React.createElement(Button, {
            onClick: handleStart,
            disabled: starting
          }, starting ? "Starting..." : "Start WebUI Server")
        )
      );
    }

    return React.createElement("iframe", {
      src: webuiUrl,
      className: "webui-iframe",
      title: "Hermes WebUI"
    });
  }

  window.__HERMES_PLUGINS__.register("hermes-webui", WebUIPage);
})();
```

#### Task: Implement loading state (hermes-dashboard-ljz) — BLOCKED by id3
**Modify:** `~/.hermes/plugins/hermes-webui/dashboard/dist/index.js`

Enhance the loading state with a spinner animation. Use the dashboard's CSS variables to stay theme-aware.

#### Task: Implement error state (hermes-dashboard-57u) — BLOCKED by id3
**Modify:** `~/.hermes/plugins/hermes-webui/dashboard/dist/index.js`

Enhance the error state with:
- Clear diagnostic info
- Start button (if webui repo path is known)
- Link to documentation

#### Task: Create dist/style.css (hermes-dashboard-a6j) — BLOCKED by id3
**Create/Modify:** `~/.hermes/plugins/hermes-webui/dashboard/dist/style.css`

```css
/* Hermes WebUI Plugin Styles */

/* Full-viewport iframe */
.webui-iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
  background: var(--color-background, #0D0D1A);
}

/* Loading spinner */
.webui-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  background: var(--color-background, #0D0D1A);
}

.webui-spinner {
  text-align: center;
  color: var(--color-muted-foreground, #888);
}

.webui-spinner::before {
  content: "";
  display: block;
  width: 40px;
  height: 40px;
  margin: 0 auto 16px;
  border: 3px solid var(--color-border, #333);
  border-top-color: var(--color-primary, #F5C542);
  border-radius: 50%;
  animation: webui-spin 0.8s linear infinite;
}

@keyframes webui-spin {
  to { transform: rotate(360deg); }
}

/* Error state */
.webui-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  background: var(--color-background, #0D0D1A);
  color: var(--color-foreground, #EAE0D5);
  text-align: center;
  padding: 2rem;
}

.webui-error h3 {
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
  color: var(--color-primary, #F5C542);
}

.webui-error p {
  color: var(--color-muted-foreground, #888);
  margin-bottom: 0.5rem;
}

.webui-error .webui-help {
  font-size: 0.8rem;
  margin: 1rem 0;
  color: var(--color-muted-foreground, #666);
  font-family: var(--font-mono, monospace);
}

/* Ensure the plugin page container fills available space */
/* The dashboard's route outlet needs this class applied */
.webui-page-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
```

---

## Phase 2: Enhanced Integration (P1 tasks)

### Epic: Enhanced Integration (hermes-dashboard-pfg)

#### Task: Bundle webui static files into plugin (hermes-dashboard-cti) — BLOCKED by 1s3
Copy `hermes_webui_reference/static/` into `~/.hermes/plugins/hermes-webui/webui/static/`.
The plugin backend can then serve these files directly, making the webui accessible even without a separate webui process running.

#### Task: Implement API proxy bridge (hermes-dashboard-1s3) — READY
Create proxy routes in `plugin_api.py` that forward requests from the dashboard to the webui's API. This allows the webui iframe's fetch calls to work through the plugin without CORS issues.

Key routes to proxy:
- `/api/plugins/hermes-webui/proxy/status` → `http://127.0.0.1:8080/api/status`
- `/api/plugins/hermes-webui/proxy/sessions` → `http://127.0.0.1:8080/api/sessions`
- etc.

#### Task: Implement theme synchronization (hermes-dashboard-lc6) — READY
Pass the active dashboard theme to the webui iframe via `postMessage`. The webui can listen for theme changes and apply them. Requires minimal modification to the webui JS.

#### Task: Implement authentication passthrough (hermes-dashboard-9hq) — READY
Share the dashboard session token with the webui iframe so the user doesn't need to log in twice. Use `postMessage` or URL parameters.

---

## Phase 3: Testing, Documentation & Deployment (P1 tasks)

### Epic: Testing, Documentation, Deployment (hermes-dashboard-chq)

#### Task: Write plugin README (hermes-dashboard-sa7) — READY
**Create:** `~/.hermes/plugins/hermes-webui/README.md`

Sections:
1. Overview — what this plugin does
2. Architecture — iframe approach, plugin structure
3. Prerequisites — Hermes Agent with dashboard, running webui server
4. Installation — copy to plugins dir, restart dashboard
5. Configuration — setting webui port
6. Troubleshooting — common issues and solutions

#### Task: Write installation guide (hermes-dashboard-763) — READY
**Create:** `docs/INSTALL.md` in the repo

Step-by-step guide:
1. Clone the repo
2. Run install script
3. Verify plugin discovery
4. Start webui server
5. Access from dashboard

#### Task: Create install.sh script (hermes-dashboard-dmo) — BLOCKED by sa7
**Create:** `install.sh` in the repo root

```bash
#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="${HOME}/.hermes/plugins/hermes-webui"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Hermes WebUI Dashboard Plugin Installer ==="

# Create plugin directory
mkdir -p "${PLUGIN_DIR}/dashboard/dist"

# Copy plugin files
cp -f "${SCRIPT_DIR}/plugin.yaml" "${PLUGIN_DIR}/"
cp -f "${SCRIPT_DIR}/dashboard/manifest.json" "${PLUGIN_DIR}/dashboard/"
cp -f "${SCRIPT_DIR}/dashboard/dist/index.js" "${PLUGIN_DIR}/dashboard/dist/"
cp -f "${SCRIPT_DIR}/dashboard/dist/style.css" "${PLUGIN_DIR}/dashboard/dist/"
cp -f "${SCRIPT_DIR}/dashboard/plugin_api.py" "${PLUGIN_DIR}/dashboard/"

echo "Plugin installed to ${PLUGIN_DIR}"
echo ""
echo "Next steps:"
echo "  1. Restart 'hermes dashboard' or run:"
echo "     curl http://127.0.0.1:9119/api/dashboard/plugins/rescan"
echo "  2. Start the Hermes WebUI server (if not running):"
echo "     cd hermes_webui_reference && python3 server.py"
echo "  3. Open the dashboard and click 'WebUI' in the nav bar"
```

#### Task: Create test suite (hermes-dashboard-2z8) — BLOCKED by id3
**Create:** `tests/test_plugin.py`

Test cases:
1. `test_manifest_valid` — manifest.json has required fields
2. `test_plugin_api_status` — /api/plugins/hermes-webui/status returns valid response
3. `test_plugin_api_config` — /api/plugins/hermes-webui/config returns valid response
4. `test_webui_detection` — port scanning finds running webui
5. `test_webui_not_running` — proper error when webui is down
6. `test_js_bundle_syntax` — dist/index.js is valid JavaScript
7. `test_css_valid` — dist/style.css is valid CSS

---

## Execution Strategy

### Parallel Workstreams
The dependency graph allows parallel execution across these groups:

**Wave 1 (no blockers — 5 tasks):**
1. `nrd` — Create plugin directory structure
2. `dxy` — Create plugin.yaml
3. `2e6` — Implement /status endpoint
4. `sbm` — Implement /config endpoint
5. `sa7` — Write README

**Wave 2 (after Wave 1):**
6. `76r` — Create manifest.json (after nrd)
7. `007` — Create dist/ stubs (after nrd)
8. `dak` — Server detection (after 2e6)
9. `id3` — React component (after 2e6)

**Wave 3 (after Wave 2):**
10. `ljz` — Loading state (after id3)
11. `57u` — Error state (after id3)
12. `a6j` — style.css (after id3)
13. `30w` — Server lifecycle (after dak)

**Wave 4+ (P1 tasks):**
14-20: Enhanced integration and testing tasks

### Verification at Each Milestone

**After Wave 1:** Plugin directory structure exists, backend endpoints return data
**After Wave 2:** Plugin registered in dashboard, WebUI tab appears in nav
**After Wave 3:** Full iframe embedding works, loading/error states render correctly
**After Wave 4:** Self-contained plugin with tests and deployment script

---

## Key Constraints & Decisions

1. **Never break the existing webui.** The reference webui in `hermes_webui_reference/` is read-only. Do not modify any files in that directory.

2. **Plugin SDK compatibility.** All JS code must use `window.__HERMES_PLUGIN_SDK__` (React, hooks, components, fetchJSON). Never import React directly. Output must be a single IIFE file.

3. **Dashboard plugin directory structure.** Must follow `~/.hermes/plugins/<name>/dashboard/manifest.json` pattern. All paths in manifest are relative to the `dashboard/` directory.

4. **Backend routes.** Plugin API routes are auto-mounted at `/api/plugins/<name>/`. The Python file must export a module-level `router = APIRouter()`.

5. **Theme awareness.** All CSS must use dashboard CSS variables (`--color-*`, `--font-*`, `--radius`, etc.) to stay compatible with any active theme.

6. **No build step.** The JS bundle is a plain IIFE file. No bundler, no npm, no build pipeline. This matches the webui's philosophy of zero-build development.

---

## Troubleshooting Reference

From `reference_extending-the-dashboard.md`:

- **Plugin tab not showing:** Check manifest at `~/.hermes/plugins/<name>/dashboard/manifest.json`, run `curl http://127.0.0.1:9119/api/dashboard/plugins/rescan`, check browser console for JS errors
- **Slot components don't render:** Sidebar slot only renders with `layoutVariant: cockpit`
- **Backend routes return 404:** Confirm `api` field in manifest, restart dashboard (API routes mount at startup, not rescan), check `~/.hermes/logs/errors.log`
- **JS bundle errors:** Check browser dev tools → Console for `window.__HERMES_PLUGINS__ is undefined`, verify bundle calls `register()` with same name as manifest
