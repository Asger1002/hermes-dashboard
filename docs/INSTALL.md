# Hermes Dashboard — Installation Guide

This guide covers installing and running the Hermes dashboard and its plugins from scratch.

---

## Requirements

- Python 3.10 or newer
- Hermes Agent installed (`pip install hermes-agent` or from source)
- A modern web browser (Chrome, Firefox, Edge, Safari)

---

## 1. Install Hermes Agent

If you have not already:

```bash
pip install hermes-agent
```

Verify:

```bash
hermes --version
```

---

## 2. Start the dashboard

```bash
hermes dashboard
```

By default the dashboard listens on http://localhost:9119. Open that URL in your browser.

To use a different port:

```bash
hermes dashboard --port 9090
```

---

## 3. Install a plugin

Plugins live in `~/.hermes/plugins/<plugin-name>/`. Each plugin is a directory containing at minimum:

- `plugin.yaml` — plugin identity manifest
- `__init__.py` — required by the plugin loader (can be empty)
- `dashboard/manifest.json` — dashboard integration manifest
- `dashboard/dist/index.js` — React component bundle (IIFE, uses Plugin SDK)

### Install the hermes-webui plugin

```bash
# Clone the repo and run install.sh:
git clone https://github.com/Asger1002/hermes-dashboard.git
cd hermes-dashboard
bash install.sh

# Or manually:
mkdir -p ~/.hermes/plugins/hermes-webui/dashboard/dist
cp plugin.yaml __init__.py ~/.hermes/plugins/hermes-webui/
cp dashboard/manifest.json dashboard/plugin_api.py ~/.hermes/plugins/hermes-webui/dashboard/
cp dashboard/dist/index.js ~/.hermes/plugins/hermes-webui/dashboard/dist/
```

Restart the dashboard after installing any plugin:

```bash
# Stop the running dashboard (Ctrl+C), then:
hermes dashboard
```

The new tab (e.g. WebUI) will appear in the nav bar.

---

## 4. Plugin discovery

The dashboard scans `~/.hermes/plugins/` at startup. Each subdirectory that contains `dashboard/manifest.json` is loaded as a UI plugin. Plugins with `dashboard/plugin_api.py` get their FastAPI router mounted at `/api/plugins/<name>/`.

To reload plugins without restarting:

```bash
curl -s http://127.0.0.1:9119/api/dashboard/plugins/rescan
```

---

## 5. Verify everything works

Open http://localhost:9119 (or your chosen port) and check:

- Dashboard loads without errors
- All expected nav tabs are present
- Plugin tabs (e.g. WebUI) appear if plugins are installed
- Browser devtools console shows no critical errors

The hermes-webui plugin provides 9 tabs:
1. **Chat** — Session-selector, markdown, SSE streaming
2. **Sessions** — List, search, create, delete
3. **Models** — Current model, available options
4. **Config** — config.yaml viewer, env vars
5. **Skills** — Skills list
6. **Profiles** — Profile management
7. **Cron** — Cron job management
8. **Analytics** — 30-day usage stats
9. **Logs** — Log viewer with level filter

---

## Uninstalling a plugin

```bash
rm -rf ~/.hermes/plugins/hermes-webui
```

Restart the dashboard. The tab will be gone.

---

## Troubleshooting

**Dashboard fails to start**
- Check Python version: `python --version` (needs 3.10+)
- Run with `--log-level debug` and read the traceback
- Make sure port 9119 is not already in use: `lsof -i :9119`

**Plugin tab missing**
- Confirm the plugin directory is directly under `~/.hermes/plugins/` (not nested)
- Confirm `dashboard/manifest.json` is valid JSON: `python3 -m json.tool ~/.hermes/plugins/hermes-webui/dashboard/manifest.json`
- Check dashboard logs for plugin load errors
- Verify `__init__.py` exists at the plugin root (required by the loader)

**API routes return 404**
- The plugin's `plugin_api.py` may have a syntax error — check dashboard logs
- Routes are mounted at `/api/plugins/<name>/` — verify the name matches the manifest

**Changes to plugin files not reflected**
- JS bundle changes require a browser hard refresh (Ctrl+Shift+R)
- Python backend changes require a dashboard restart

---

## Directory reference

```
~/.hermes/
├── plugins/
│   └── <plugin-name>/
│       ├── plugin.yaml
│       ├── __init__.py            (required, can be empty)
│       └── dashboard/
│           ├── manifest.json
│           ├── plugin_api.py      (optional backend)
│           └── dist/
│               └── index.js
├── dashboard-themes/
│   └── my-theme.yaml
└── config.yaml                    (main Hermes config)
```
