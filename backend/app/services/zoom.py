"""Zoom Server-to-Server OAuth helpers for live class meetings (config: DB/env)."""
from __future__ import annotations

import base64
from datetime import datetime, timezone

import httpx

from app.core.system_config import get_system_config

_token_cache: dict = {"token": None, "expires_at": 0, "cred_key": None}


async def is_configured() -> bool:
    z = (await get_system_config())["zoom"]
    return bool(z.get("account_id") and z.get("client_id") and z.get("client_secret"))


async def _zoom_error(resp: "httpx.Response") -> RuntimeError:
    """Zoom failure with the JSON reason it returned (403/401/400 are all explained in the body)."""
    try:
        body = resp.json()
        reason = body.get("reason") or body.get("message") or resp.text
        code = body.get("code", "")
    except Exception:  # noqa: BLE001
        reason = resp.text
        code = ""
    detail = f"Zoom {resp.request.method} {resp.request.url.path} -> HTTP {resp.status_code}"
    if code:
        detail += f" (code {code})"
    return RuntimeError(f"{detail}: {reason}"[:500])


async def get_access_token() -> str:
    z = (await get_system_config())["zoom"]
    if not await is_configured():
        raise RuntimeError("Zoom is not configured (System → Zoom)")
    now = datetime.now(timezone.utc).timestamp()
    cred_key = (z.get("account_id"), z.get("client_id"), z.get("client_secret"))
    if (
        _token_cache.get("token")
        and _token_cache.get("expires_at", 0) > now + 60
        and _token_cache.get("cred_key") == cred_key
    ):
        return _token_cache["token"]

    credentials = base64.b64encode(
        f"{z['client_id']}:{z['client_secret']}".encode()
    ).decode()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://zoom.us/oauth/token",
            headers={"Authorization": f"Basic {credentials}"},
            # form-encoded - Zoom rejects a raw body with "Missing grant type"
            data={"grant_type": "account_credentials", "account_id": z["account_id"]},
        )
        if resp.status_code >= 400:
            raise await _zoom_error(resp)
        data = resp.json()
    token = data["access_token"]
    expires_in = int(data.get("expires_in", 3600))
    _token_cache["token"] = token
    _token_cache["expires_at"] = now + expires_in
    _token_cache["cred_key"] = cred_key
    return token


async def create_meeting(
    topic: str,
    start_time_iso: str | None = None,
    duration_min: int = 60,
    agenda: str = "",
) -> dict:
    """Create a scheduled Zoom meeting. start_time_iso must be UTC ISO (YYYY-MM-DDTHH:MM:SSZ)."""
    token = await get_access_token()
    z = (await get_system_config())["zoom"]
    host = z.get("host_email") or "me"
    # S2S OAuth must not use "me" — resolve account users if no host email set
    user_path = host
    if host == "me":
        async with httpx.AsyncClient(timeout=30) as client:
            me = await client.get(
                "https://api.zoom.us/v2/users/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            if me.status_code == 200:
                user_path = me.json().get("email") or "me"
            else:
                users = await client.get(
                    "https://api.zoom.us/v2/users?page_size=1",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if users.status_code >= 400:
                    raise await _zoom_error(users)
                items = users.json().get("users") or []
                if not items:
                    raise RuntimeError("No Zoom users available to host meetings")
                user_path = items[0]["email"]

    payload: dict = {
        "topic": topic or "Live Class",
        "type": 2,  # scheduled
        "duration": max(15, duration_min),
        "timezone": "UTC",
        "agenda": agenda,
        "settings": {
            "join_before_host": True,
            "waiting_room": False,
            "mute_upon_entry": True,
            "approval_type": 0,
            "auto_recording": "none",
        },
    }
    if start_time_iso:
        payload["start_time"] = start_time_iso

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://api.zoom.us/v2/users/{user_path}/meetings",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code >= 400:
            raise await _zoom_error(resp)
        return resp.json()


async def delete_meeting(meeting_id: str) -> None:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(
            f"https://api.zoom.us/v2/meetings/{meeting_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code not in (204, 404):
            raise await _zoom_error(resp)
