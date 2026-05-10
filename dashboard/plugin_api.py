import os
import socket
import subprocess
import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response

router = APIRouter()

# Configuration
WEBUI_DEFAULT_PORT = 8080
WEBUI_HOST = "127.0.0.1"
WEBUI_COMMON_PORTS = [8080, 8081, 8082, 8888, 5000]

_webui_process = None


def _probe_port(host: str, port: int, timeout: float = 0.5) -> bool:
    """Return True if port is open."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        return s.connect_ex((host, port)) == 0
    except Exception:
        return False
    finally:
        s.close()


def _find_webui_port() -> int | None:
    """Scan common ports for a running webui server."""
    for port in WEBUI_COMMON_PORTS:
        if _probe_port(WEBUI_HOST, port, timeout=0.3):
            return port
    return None


def _find_webui_process() -> list[str]:
    """Find running webui server.py PIDs."""
    try:
        result = subprocess.run(
            ["pgrep", "-f", "server.py"],
            capture_output=True, text=True, timeout=2
        )
        pids = result.stdout.strip().split("\n") if result.stdout.strip() else []
        return [p for p in pids if p]
    except Exception:
        return []


@router.get("/status")
async def get_status():
    """Return webui server status and URL."""
    # First try default port
    if _probe_port(WEBUI_HOST, WEBUI_DEFAULT_PORT):
        port = WEBUI_DEFAULT_PORT
        running = True
    else:
        port = _find_webui_port()
        running = port is not None

    return {
        "running": running,
        "url": f"http://{WEBUI_HOST}:{port}" if running else None,
        "port": port,
        "pids": _find_webui_process(),
    }


@router.get("/config")
async def get_config():
    """Return plugin configuration including webui URL and capabilities."""
    status = await get_status()
    return {
        "webui_url": status["url"],
        "running": status["running"],
        "version": "1.0.0",
        "capabilities": {
            "embedded": False,
            "theme_sync": False,
            "auth_passthrough": False,
        },
    }


@router.post("/start")
async def start_webui():
    """Start the webui server."""
    global _webui_process
    # Check if already running
    existing_port = _find_webui_port()
    if existing_port is not None:
        return {"status": "already_running", "port": existing_port}
    if _webui_process and _webui_process.poll() is None:
        return {"status": "already_running", "pid": _webui_process.pid}

    # Try to find webui server.py
    candidate_paths = [
        os.path.expanduser("~/Drive/Projects/hermes-dashboard/hermes_webui_reference"),
        os.path.expanduser("~/.hermes/plugins/hermes-webui/webui"),
    ]
    webui_dir = None
    for p in candidate_paths:
        if os.path.isfile(os.path.join(p, "server.py")):
            webui_dir = p
            break

    if not webui_dir:
        return {"status": "error", "message": "WebUI server.py not found in known locations"}

    try:
        _webui_process = subprocess.Popen(
            ["python3", "server.py"],
            cwd=webui_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"status": "started", "pid": _webui_process.pid, "cwd": webui_dir}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/stop")
async def stop_webui():
    """Stop the webui server managed by this plugin."""
    global _webui_process
    if _webui_process and _webui_process.poll() is None:
        _webui_process.terminate()
        try:
            _webui_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _webui_process.kill()
            _webui_process.wait()
        _webui_process = None
        return {"status": "stopped"}
    return {"status": "not_running"}


# Phase 2: API proxy bridge
@router.api_route("/proxy/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_webui(path: str, request: Request):
    """Proxy requests to the webui API server."""
    port = _find_webui_port()
    if port is None:
        return {"error": "WebUI server not running"}

    target_url = f"http://127.0.0.1:{port}/{path}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            method = request.method
            headers = dict(request.headers)
            # Remove host header to avoid conflicts
            headers.pop("host", None)
            body = await request.body()

            resp = await client.request(
                method=method,
                url=target_url,
                headers=headers,
                content=body,
                params=dict(request.query_params)
            )

            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=dict(resp.headers),
                media_type=resp.headers.get("content-type", "application/json")
            )
    except Exception as e:
        return {"error": f"Proxy error: {str(e)}"}


# Phase 2: Theme sync stub
@router.get("/theme")
async def get_theme_config():
    """Return theme synchronization status."""
    return {
        "enabled": False,
        "note": "Theme sync is a Phase 3 feature. Planned via postMessage bridge."
    }


# Phase 2: Auth passthrough stub
@router.get("/auth")
async def get_auth_config():
    """Return auth passthrough status."""
    return {
        "enabled": False,
        "note": "Auth passthrough is a Phase 3 feature. Planned via shared session token."
    }
