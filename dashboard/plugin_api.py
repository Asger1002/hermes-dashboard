"""
Hermes WebUI Dashboard Plugin — Backend API

Auto-mounted by the Hermes Dashboard at /api/plugins/hermes-webui/
Provides session creation, streaming chat, and file browsing endpoints.

NO separate server process — this runs inside the dashboard's FastAPI app.
"""
import asyncio
import json
import logging
import os
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Add hermes-agent to path so we can import AIAgent and SessionDB
# ---------------------------------------------------------------------------
_HERMES_AGENT_PATHS = [
    os.path.expanduser("~/Drive/Projects/hermes-agent"),
    os.path.expanduser("~/.hermes/hermes-agent"),
    str(Path(__file__).resolve().parent.parent.parent.parent / "hermes-agent"),
]
for p in _HERMES_AGENT_PATHS:
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)

# ---------------------------------------------------------------------------
# Stream registry (module-level, thread-safe)
# ---------------------------------------------------------------------------
_STREAMS: dict[str, asyncio.Queue] = {}
_STREAMS_LOCK = threading.Lock()
_STREAM_CANCEL: set[str] = set()

# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_status():
    return {"ok": True, "version": "2.0.0"}


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@router.post("/sessions")
async def create_session(request: Request):
    """Create a new Hermes session."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    workspace = body.get("workspace") or os.getcwd()
    model = body.get("model") or ""

    try:
        from hermes_state import SessionDB
        db = SessionDB()
        try:
            session_id = db.create_session(
                title="WebUI Session",
                model=model or None,
                workspace=workspace,
            )
            return {
                "session_id": session_id,
                "workspace": workspace,
                "model": model or None,
                "created_at": time.time(),
            }
        finally:
            db.close()
    except Exception as e:
        logger.exception("Failed to create session")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Chat streaming
# ---------------------------------------------------------------------------

def _run_agent_thread(
    stream_id: str,
    session_id: str,
    message: str,
    model: Optional[str],
    workspace: str,
    loop: asyncio.AbstractEventLoop,
):
    """Run the agent in a daemon thread and feed events to the queue."""
    queue = _STREAMS.get(stream_id)
    if queue is None:
        return

    async def emit(event_type: str, data):
        try:
            queue.put_nowait({"type": event_type, "data": data})
        except asyncio.QueueFull:
            pass

    try:
        from hermes_state import SessionDB
        from run_agent import AIAgent

        # Load session
        db = SessionDB()
        try:
            session = db.get_session(session_id)
            if not session:
                future = asyncio.run_coroutine_threadsafe(
                    emit("error", "Session not found"), loop
                )
                return
            messages = session.get("messages") or []
        finally:
            db.close()

        # Save/restore HERMES_HOME
        saved_home = os.environ.get("HERMES_HOME", "")
        os.environ["HERMES_HOME"] = os.path.expanduser("~/.hermes")

        try:
            # Build conversation history
            conversation_history = messages if isinstance(messages, list) else []

            # Create agent
            agent = AIAgent(
                model=model or "",
                platform="cli",
                quiet_mode=True,
                session_id=session_id,
                enabled_toolsets=None,  # Use defaults
            )

            # Stream callbacks
            def on_token(text: Optional[str]):
                if text is None:
                    return
                future = asyncio.run_coroutine_threadsafe(
                    emit("token", text), loop
                )
                try:
                    future.result(timeout=1)
                except Exception:
                    pass

            def on_tool(name: str, preview: str):
                future = asyncio.run_coroutine_threadsafe(
                    emit("tool", {"name": name, "preview": preview}), loop
                )
                try:
                    future.result(timeout=1)
                except Exception:
                    pass

            # Check cancel
            if stream_id in _STREAM_CANCEL:
                future = asyncio.run_coroutine_threadsafe(
                    emit("done", {"cancelled": True}), loop
                )
                return

            # Run agent
            result = agent.run_conversation(
                user_message=message,
                conversation_history=conversation_history,
                task_id=session_id,
            )

            # Save updated messages
            final_response = result.get("final_response", "")
            updated_messages = result.get("messages", conversation_history)

            db = SessionDB()
            try:
                db.update_session(session_id, {"messages": updated_messages})
            finally:
                db.close()

            future = asyncio.run_coroutine_threadsafe(
                emit("done", {
                    "final_response": final_response,
                    "session_id": session_id,
                    "message_count": len(updated_messages),
                }),
                loop,
            )

        finally:
            os.environ["HERMES_HOME"] = saved_home

    except Exception as e:
        logger.exception("Agent thread error")
        future = asyncio.run_coroutine_threadsafe(
            emit("error", str(e)), loop
        )
    finally:
        # Schedule cleanup
        def cleanup():
            with _STREAMS_LOCK:
                if stream_id in _STREAMS:
                    del _STREAMS[stream_id]
                _STREAM_CANCEL.discard(stream_id)
        loop.call_soon_threadsafe(cleanup)


@router.post("/chat/start")
async def start_chat(request: Request):
    """Start a chat with the Hermes agent. Returns stream_id for SSE."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    session_id = body.get("session_id")
    message = body.get("message", "")

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    if not message.strip():
        raise HTTPException(status_code=400, detail="message is required")

    # Get session info for model
    model = body.get("model")
    workspace = body.get("workspace") or os.getcwd()

    if not model:
        try:
            from hermes_state import SessionDB
            db = SessionDB()
            try:
                session = db.get_session(session_id)
                if session:
                    model = session.get("model")
                    workspace = session.get("workspace") or workspace
            finally:
                db.close()
        except Exception:
            pass

    # Create stream
    stream_id = uuid.uuid4().hex[:12]
    queue: asyncio.Queue = asyncio.Queue(maxsize=256)

    with _STREAMS_LOCK:
        _STREAMS[stream_id] = queue
        _STREAM_CANCEL.discard(stream_id)

    # Spawn agent thread
    loop = asyncio.get_running_loop()
    thread = threading.Thread(
        target=_run_agent_thread,
        args=(stream_id, session_id, message, model, workspace, loop),
        daemon=True,
    )
    thread.start()

    return {"stream_id": stream_id, "status": "started"}


@router.get("/chat/stream/{stream_id}")
async def stream_chat(stream_id: str, request: Request):
    """SSE endpoint for streaming agent events."""
    with _STREAMS_LOCK:
        queue = _STREAMS.get(stream_id)

    if queue is None:
        raise HTTPException(status_code=404, detail="Stream not found")

    async def event_generator():
        heartbeat_interval = 15
        last_event = time.time()

        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    # Send heartbeat if needed
                    if time.time() - last_event > heartbeat_interval:
                        yield ": heartbeat\n\n"
                        last_event = time.time()
                    continue

                last_event = time.time()
                event_type = event.get("type", "message")
                data = event.get("data", "")

                if isinstance(data, (dict, list)):
                    data_str = json.dumps(data)
                else:
                    data_str = str(data)

                # SSE format: event: <type>\ndata: <json>\n\n
                yield f"event: {event_type}\ndata: {data_str}\n\n"

                if event_type in ("done", "error"):
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.exception("SSE generator error")
            yield f"event: error\ndata: {json.dumps(str(e))}\n\n"
        finally:
            # Clean up
            with _STREAMS_LOCK:
                if stream_id in _STREAMS:
                    # Drain remaining items
                    while not queue.empty():
                        try:
                            queue.get_nowait()
                        except asyncio.QueueEmpty:
                            break
                    del _STREAMS[stream_id]
                _STREAM_CANCEL.discard(stream_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/cancel/{stream_id}")
async def cancel_chat(stream_id: str):
    """Cancel a running agent stream."""
    with _STREAMS_LOCK:
        if stream_id in _STREAMS:
            _STREAM_CANCEL.add(stream_id)
            return {"status": "cancelled"}
    return {"status": "not_found"}


# ---------------------------------------------------------------------------
# File browser
# ---------------------------------------------------------------------------

MAX_FILE_BYTES = 200 * 1024  # 200KB


def _safe_resolve(root: str, requested: str) -> str:
    """Resolve path relative to root, preventing traversal."""
    root_path = Path(root).resolve()
    target = (root_path / requested).resolve()
    try:
        target.relative_to(root_path)
    except ValueError:
        raise HTTPException(status_code=403, detail="Path traversal denied")
    return str(target)


@router.get("/files")
async def list_files(path: str = Query(default=".")):
    """List files in a workspace directory."""
    root = Path(path).expanduser().resolve()
    if not root.exists():
        raise HTTPException(status_code=404, detail="Directory not found")
    if not root.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    try:
        entries = []
        for entry in sorted(root.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            try:
                stat = entry.stat()
                entries.append({
                    "name": entry.name,
                    "path": str(entry),
                    "type": "directory" if entry.is_dir() else "file",
                    "size": stat.st_size,
                })
            except OSError:
                continue

            if len(entries) >= 200:
                break

        return {"path": str(root), "entries": entries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/content")
async def read_file_content(
    path: str = Query(...),
    file: str = Query(...),
):
    """Read file content (max 200KB)."""
    target = _safe_resolve(path, file)

    try:
        file_path = Path(target)
        if not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        size = file_path.stat().st_size
        if size > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail=f"File too large (max {MAX_FILE_BYTES} bytes)")

        content = file_path.read_text(encoding="utf-8", errors="replace")
        lines = content.count("\n") + 1

        return {
            "content": content,
            "path": str(file_path),
            "size": size,
            "lines": lines,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
