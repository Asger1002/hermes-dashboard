# Hermes Dashboard — Installation Guide

This guide covers installing and running the Hermes dashboard and its plugins from scratch.

---

## Requirements

- Python 3.10 or newer
- Hermes Agent installed (`pip install hermes-agent` or from source)
- A modern web browser (Chrome, Firefox, Edge, Safari)
- Optional: Node.js 18+ only if you want to rebuild plugin JS bundles from source

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

By default the dashboard listens on http://localhost:7080. Open that URL in your browser.

To use a different port:

```bash
hermes dashboard --port 9090
```

To enable debug logging:

```bash
hermes dashboard --log-level debug
```

---

## 3. Install a plugin

Plugins live in `~/.hermes/plugins/<plugin-name>/`. Each plugin is a directory containing at minimum:

- `plugin.yaml` — plugin identity manifest
- `dashboard/manifest.json` — dashboard integration manifest
- `dashboard/dist/index.js` — compiled React component bundle

### Install the hermes-webui plugin

```bash
# If you have the plugin source directory:
cp -r /path/to/hermes-webui ~/.hermes/plugins/hermes-webui

# Verify layout:
ls ~/.hermes/plugins/hermes-webui/dashboard/
# Should show: manifest.json  plugin_api.py  dist/
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

To reload plugins without restarting: the dashboard watches the plugin directory by default. You can also trigger a reload via the dashboard settings panel.

---

## 5. Configure a plugin

Plugin configuration is done by editing constants in `plugin_api.py`. For example, for hermes-webui:

```bash
$EDITOR ~/.hermes/plugins/hermes-webui/dashboard/plugin_api.py
```

Change `WEBUI_DEFAULT_PORT`, save, then restart the dashboard.

---

## 6. Themes

Themes are YAML files in `~/.hermes/dashboard-themes/`. Drop any theme file there and it appears in the dashboard theme switcher (Settings → Theme) without a restart.

```bash
mkdir -p ~/.hermes/dashboard-themes
cp /path/to/my-theme.yaml ~/.hermes/dashboard-themes/
```

---

## 7. Verify everything works

Open http://localhost:7080 (or your chosen port) and check:

- Dashboard loads without errors
- All expected nav tabs are present
- Plugin tabs (e.g. WebUI) appear if plugins are installed
- Browser devtools console shows no critical errors

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
- Make sure port 7080 is not already in use: `lsof -i :7080`

**Plugin tab missing**
- Confirm the plugin directory is directly under `~/.hermes/plugins/` (not nested)
- Confirm `dashboard/manifest.json` is valid JSON: `python -m json.tool ~/.hermes/plugins/hermes-webui/dashboard/manifest.json`
- Check dashboard logs for plugin load errors

**API routes return 404**
- The plugin's `plugin_api.py` may have a syntax error — check dashboard logs
- Routes are mounted at `/api/plugins/<name>/` — verify the name matches the manifest

**Changes to plugin files not reflected**
- JS bundle changes require a browser hard refresh (Ctrl+Shift+R)
- Python backend changes require a dashboard restart
- Theme YAML changes are picked up live

---

## Directory reference

```
~/.hermes/
├── plugins/
│   └── <plugin-name>/
│       ├── plugin.yaml
│       └── dashboard/
│           ├── manifest.json
│           ├── plugin_api.py        (optional backend)
│           └── dist/
│               ├── index.js
│               └── style.css
├── dashboard-themes/
│   └── my-theme.yaml
└── config.yaml                      (main Hermes config)
```
