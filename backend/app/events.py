"""Realtime events: WebSocket fan-out backed by Redis pub/sub.

Channels: `public` (anon: banners/promos/catalogue), `staff` (admin+lecturer:
live sessions/content), `admin` (payments/memberships/enrolments), `user:{id}`
(personal payment/enrolment/membership updates).
"""
import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import safe_decode

CHANNEL_PREFIX = "lms:"

router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, channel: str) -> None:
        self._channels.setdefault(channel, set()).add(ws)

    def disconnect(self, ws: WebSocket, channel: str) -> None:
        self._channels.get(channel, set()).discard(ws)

    async def broadcast(self, channel: str, message: str) -> None:
        for ws in list(self._channels.get(channel, ())):
            try:
                await ws.send_text(message)
            except Exception:  # noqa: BLE001 — dead socket, drop it
                self._channels.get(channel, set()).discard(ws)


manager = ConnectionManager()


async def emit(channel: str, event: str, payload: dict | None = None) -> None:
    """Publish an event (Redis → listener → local WebSockets; local fallback if Redis is down)."""
    message = json.dumps(
        {"event": event, "payload": payload or {}, "ts": datetime.now(timezone.utc).isoformat()},
        default=str,
    )
    try:
        await get_redis().publish(f"{CHANNEL_PREFIX}{channel}", message)
    except Exception:  # noqa: BLE001 — degrade to direct local delivery
        await manager.broadcast(channel, message)


async def _redis_listener() -> None:
    while True:
        try:
            pubsub = get_redis().pubsub()
            await pubsub.psubscribe(f"{CHANNEL_PREFIX}*")
            async for msg in pubsub.listen():
                if msg.get("type") != "pmessage":
                    continue
                channel = (msg.get("channel") or "").removeprefix(CHANNEL_PREFIX)
                data = msg.get("data")
                if channel and data:
                    await manager.broadcast(channel, data if isinstance(data, str) else str(data))
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — redis down: retry
            print(f"[ws] redis listener error: {exc}; retrying in 5s")
            await asyncio.sleep(5)


_listener_task: asyncio.Task | None = None


async def start_events() -> None:
    global _listener_task
    try:
        get_redis()
    except Exception:  # noqa: BLE001 — no redis: emit() falls back to local broadcast
        return
    if _listener_task is None:
        _listener_task = asyncio.create_task(_redis_listener())


async def stop_events() -> None:
    global _listener_task
    if _listener_task:
        _listener_task.cancel()
        try:
            await _listener_task
        except asyncio.CancelledError:
            pass
        _listener_task = None


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str | None = Query(default=None)):
    await ws.accept()
    channels = {"public"}
    if token:
        payload = safe_decode(token)
        if payload and payload.get("type") == "access":
            user = await get_db().users.find_one({"_id": payload.get("sub")})
            if user and user.get("status") != "suspended":
                channels.add(f"user:{user['_id']}")
                if user.get("role") == "admin":
                    channels.update({"admin", "staff"})
                elif user.get("role") == "lecturer":
                    channels.add("staff")
                elif user.get("role") == "counselor":
                    channels.add("staff")
    for ch in channels:
        await manager.connect(ws, ch)
    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text(json.dumps({"event": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        for ch in channels:
            manager.disconnect(ws, ch)
