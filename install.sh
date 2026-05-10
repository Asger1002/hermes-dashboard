#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="hermes-webui"
PLUGIN_DIR="${HOME}/.hermes/plugins/${PLUGIN_NAME}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Hermes WebUI Dashboard Plugin Installer ==="
echo ""

# Detect source directory
if [[ ! -f "${SCRIPT_DIR}/dashboard/manifest.json" ]]; then
  echo "ERROR: Cannot find dashboard/manifest.json in ${SCRIPT_DIR}"
  echo "Please run this script from the hermes-dashboard repo root."
  exit 1
fi

# Create target directories
mkdir -p "${PLUGIN_DIR}/dashboard/dist"

# Copy plugin files
echo "Installing plugin files..."
cp -f "${SCRIPT_DIR}/plugin.yaml"      "${PLUGIN_DIR}/"
cp -f "${SCRIPT_DIR}/__init__.py"      "${PLUGIN_DIR}/"
cp -f "${SCRIPT_DIR}/dashboard/manifest.json"  "${PLUGIN_DIR}/dashboard/"
cp -f "${SCRIPT_DIR}/dashboard/plugin_api.py"  "${PLUGIN_DIR}/dashboard/"
cp -f "${SCRIPT_DIR}/dashboard/dist/index.js"  "${PLUGIN_DIR}/dashboard/dist/"

echo ""
echo "Plugin installed to: ${PLUGIN_DIR}"
echo ""
echo "Next steps:"
echo "  1. Restart the Hermes dashboard:"
echo "       hermes dashboard"
echo "  2. Or trigger a plugin rescan:"
echo "       curl -s http://127.0.0.1:9119/api/dashboard/plugins/rescan"
echo "  3. Open the dashboard and click the 'WebUI' tab in the nav bar"
echo ""
echo "No separate server needed — the plugin runs natively in the dashboard."
echo ""
echo "Done!"
