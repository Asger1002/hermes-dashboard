"""Tests for the hermes-webui dashboard plugin."""
import json
import os
import ast
from pathlib import Path

PLUGIN_BASE = Path.home() / ".hermes" / "plugins" / "hermes-webui"
DASHBOARD_DIR = PLUGIN_BASE / "dashboard"
DIST_DIR = DASHBOARD_DIR / "dist"


def test_plugin_yaml_exists():
    """plugin.yaml must exist at plugin root."""
    assert (PLUGIN_BASE / "plugin.yaml").exists(), "plugin.yaml not found"


def test_manifest_exists():
    """manifest.json must exist in dashboard/."""
    assert (DASHBOARD_DIR / "manifest.json").exists(), "manifest.json not found"


def test_manifest_valid_json():
    """manifest.json must be valid JSON."""
    with open(DASHBOARD_DIR / "manifest.json") as f:
        data = json.load(f)
    assert isinstance(data, dict)


def test_manifest_required_fields():
    """manifest.json must have name, label, entry, api fields."""
    with open(DASHBOARD_DIR / "manifest.json") as f:
        data = json.load(f)
    for field in ["name", "label", "entry", "api"]:
        assert field in data, f"manifest.json missing field: {field}"


def test_manifest_tab_config():
    """manifest.json must have a tab config with path."""
    with open(DASHBOARD_DIR / "manifest.json") as f:
        data = json.load(f)
    assert "tab" in data
    assert "path" in data["tab"]


def test_entry_file_exists():
    """dist/index.js must exist."""
    with open(DASHBOARD_DIR / "manifest.json") as f:
        data = json.load(f)
    entry = DASHBOARD_DIR / data["entry"]
    assert entry.exists(), f"Entry file not found: {entry}"


def test_css_file_exists():
    """dist/style.css must exist."""
    with open(DASHBOARD_DIR / "manifest.json") as f:
        data = json.load(f)
    css = DASHBOARD_DIR / data["css"]
    assert css.exists(), f"CSS file not found: {css}"


def test_plugin_api_exists():
    """plugin_api.py must exist in dashboard/."""
    assert (DASHBOARD_DIR / "plugin_api.py").exists()


def test_plugin_api_syntax():
    """plugin_api.py must be valid Python."""
    source = (DASHBOARD_DIR / "plugin_api.py").read_text()
    try:
        ast.parse(source)
    except SyntaxError as e:
        raise AssertionError(f"plugin_api.py has syntax error: {e}")


def test_plugin_api_has_router():
    """plugin_api.py must define a FastAPI router."""
    source = (DASHBOARD_DIR / "plugin_api.py").read_text()
    assert "router = APIRouter()" in source or "router=APIRouter()" in source


def test_plugin_api_has_status_endpoint():
    """plugin_api.py must have a /status route."""
    source = (DASHBOARD_DIR / "plugin_api.py").read_text()
    assert '@router.get("/status")' in source


def test_plugin_api_has_config_endpoint():
    """plugin_api.py must have a /config route."""
    source = (DASHBOARD_DIR / "plugin_api.py").read_text()
    assert '@router.get("/config")' in source


def test_js_bundle_not_empty():
    """dist/index.js must not be empty."""
    content = (DIST_DIR / "index.js").read_text()
    assert len(content.strip()) > 100, "index.js appears to be empty or near-empty"


def test_js_bundle_registers_plugin():
    """dist/index.js must call window.__HERMES_PLUGINS__.register."""
    content = (DIST_DIR / "index.js").read_text()
    assert "__HERMES_PLUGINS__" in content
    assert ".register" in content


def test_css_not_empty():
    """dist/style.css must not be empty."""
    content = (DIST_DIR / "style.css").read_text()
    assert len(content.strip()) > 20, "style.css appears empty"


def test_css_has_iframe_class():
    """dist/style.css must style the iframe."""
    content = (DIST_DIR / "style.css").read_text()
    assert ".webui-iframe" in content
