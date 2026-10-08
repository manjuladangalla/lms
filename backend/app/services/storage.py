"""File storage: local disk or S3-compatible (chosen by super admin)."""
from __future__ import annotations

import asyncio
import mimetypes
from pathlib import Path
from uuid import uuid4

from app.core.system_config import get_system_config

_s3_cache: dict = {"key": None, "client": None}


def _s3_client(cfg: dict):
    import boto3
    from botocore.client import Config

    key = (
        cfg.get("s3_endpoint_url"),
        cfg.get("s3_access_key"),
        cfg.get("s3_secret_key"),
        cfg.get("s3_region"),
    )
    if _s3_cache["client"] is None or _s3_cache["key"] != key:
        _s3_cache["client"] = boto3.client(
            "s3",
            endpoint_url=cfg.get("s3_endpoint_url") or None,
            aws_access_key_id=cfg.get("s3_access_key") or None,
            aws_secret_access_key=cfg.get("s3_secret_key") or None,
            region_name=cfg.get("s3_region") or "auto",
            config=Config(signature_version="s3v4"),
        )
        _s3_cache["key"] = key
    return _s3_cache["client"]


async def ensure_bucket() -> None:
    cfg = (await get_system_config())["storage"]
    if cfg.get("backend") != "s3" or not cfg.get("s3_access_key"):
        return
    from botocore.exceptions import BotoCoreError, ClientError

    def _head():
        try:
            _s3_client(cfg).head_bucket(Bucket=cfg.get("s3_bucket"))
        except (ClientError, BotoCoreError):
            try:
                _s3_client(cfg).create_bucket(Bucket=cfg.get("s3_bucket"))
            except (ClientError, BotoCoreError):
                pass

    await asyncio.to_thread(_head)


def storage_info(cfg: dict) -> dict:
    backend = cfg.get("backend", "local")
    if backend == "s3":
        ready = bool(cfg.get("s3_access_key") and cfg.get("s3_bucket"))
        return {"backend": "s3", "ready": ready, "bucket": cfg.get("s3_bucket")}
    return {"backend": "local", "ready": True, "dir": cfg.get("local_dir") or "uploads"}


def _s3_public_url(cfg: dict, key: str) -> str:
    if cfg.get("s3_public_url"):
        return f"{cfg['s3_public_url'].rstrip('/')}/{key}"
    if cfg.get("s3_endpoint_url"):
        return f"{cfg['s3_endpoint_url'].rstrip('/')}/{cfg.get('s3_bucket')}/{key}"
    return key


def _local_public_url(cfg: dict, key: str) -> str:
    base = (cfg.get("local_public_url") or "").rstrip("/")
    return f"{base}/media/{key}" if base else f"/media/{key}"


async def upload_bytes(data: bytes, prefix: str, content_type: str | None = None) -> str:
    """Store bytes on the active backend. Returns a public URL ("" on failure)."""
    cfg = (await get_system_config())["storage"]
    key = f"{prefix}/{uuid4().hex}"
    ctype = content_type or mimetypes.guess_type(key)[0] or "application/octet-stream"

    if cfg.get("backend") == "s3":
        if not cfg.get("s3_access_key") or not cfg.get("s3_bucket"):
            print("[storage] s3 selected but access key/bucket not configured")
            return ""

        def _put():
            _s3_client(cfg).put_object(
                Bucket=cfg.get("s3_bucket"), Key=key, Body=data, ContentType=ctype
            )

        try:
            await asyncio.to_thread(_put)
        except Exception as exc:  # noqa: BLE001 — surface as empty URL to callers
            print(f"[storage] s3 upload failed: {exc}")
            return ""
        return _s3_public_url(cfg, key)

    # local disk
    root = Path(cfg.get("local_dir") or "uploads")
    path = root / key
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)
    except OSError as exc:
        print(f"[storage] local write failed: {exc}")
        return ""
    return _local_public_url(cfg, key)
