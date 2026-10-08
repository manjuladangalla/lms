"""Runtime system configuration: DB-stored settings (super admin) over env defaults.

Sections: storage, zoom, google, mail.
DB values override env; a key present in the DB doc wins even if empty (clearing works).
Cached in-process for a short TTL and invalidated on save.
"""
from __future__ import annotations

import time

from app.core.config import settings as env

CACHE_TTL = 30.0
_cache: dict = {"data": None, "ts": 0.0}

SECRET_KEYS = {
    "storage": {"s3_secret_key"},
    "zoom": {"client_secret"},
    "google": {"client_secret"},
    "mail": {"password"},
}

SYSTEM_DOC_ID = "system"


def _env_defaults() -> dict:
    return {
        "storage": {
            "backend": "s3" if env.s3_access_key else "local",
            "local_dir": env.upload_dir,
            "local_public_url": env.public_api_url,
            "s3_endpoint_url": env.s3_endpoint_url,
            "s3_access_key": env.s3_access_key,
            "s3_secret_key": env.s3_secret_key,
            "s3_bucket": env.s3_bucket,
            "s3_region": env.s3_region,
            "s3_public_url": env.s3_public_url,
        },
        "zoom": {
            "account_id": env.zoom_account_id,
            "client_id": env.zoom_client_id,
            "client_secret": env.zoom_client_secret,
            "host_email": env.zoom_host_email,
        },
        "google": {
            "enabled": bool(env.google_client_id),
            "client_id": env.google_client_id,
            "client_secret": env.google_client_secret,
        },
        "mail": {
            "enabled": bool(env.smtp_host),
            "host": env.smtp_host,
            "port": env.smtp_port,
            "username": env.smtp_username,
            "password": env.smtp_password,
            "from_email": env.smtp_from,
            "tls": env.smtp_tls,
            "otp_ttl_seconds": env.otp_ttl_seconds,
            "otp_length": env.otp_length,
        },
    }


def _merge(base: dict, db_section: dict) -> dict:
    out = dict(base)
    for k, v in db_section.items():
        if k in out and v is not None:
            out[k] = v
    return out


async def get_system_config() -> dict:
    """Effective system config (env defaults overridden by DB)."""
    now = time.monotonic()
    if _cache["data"] is not None and now - _cache["ts"] < CACHE_TTL:
        return _cache["data"]
    doc: dict = {}
    try:
        from app.core.database import get_db

        db = get_db()
        doc = await db.settings.find_one({"_id": SYSTEM_DOC_ID}) or {}
    except Exception as exc:  # noqa: BLE001 — config must not crash requests
        print(f"[system-config] load failed: {exc}")
    base = _env_defaults()
    merged = {section: _merge(base[section], doc.get(section) or {}) for section in base}
    _cache["data"] = merged
    _cache["ts"] = now
    return merged


def invalidate_system_config() -> None:
    _cache["data"] = None
    _cache["ts"] = 0.0


def mask_config(cfg: dict) -> dict:
    """Effective config with secrets blanked + has_* flags for the admin UI."""
    out: dict = {}
    for section, keys in cfg.items():
        sec = dict(keys)
        for sk in SECRET_KEYS.get(section, ()):
            if sk in sec:
                sec[f"{sk}_set"] = bool(sec[sk])
                sec[sk] = ""
        out[section] = sec
    return out
