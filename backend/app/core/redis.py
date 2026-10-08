import json
from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings

redis_client: aioredis.Redis | None = None


async def connect_redis() -> None:
    global redis_client
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    await redis_client.ping()


async def close_redis() -> None:
    global redis_client
    if redis_client:
        await redis_client.aclose()
    redis_client = None


def get_redis() -> aioredis.Redis:
    if redis_client is None:
        raise RuntimeError("Redis is not initialized")
    return redis_client


async def cache_get(key: str) -> Any | None:
    r = get_redis()
    raw = await r.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def cache_set(key: str, value: Any, ttl: int = 120) -> None:
    import datetime as _dt

    def _default(v: Any) -> Any:
        if isinstance(v, _dt.datetime):
            if v.tzinfo is None:
                v = v.replace(tzinfo=_dt.timezone.utc)
            return v.isoformat().replace("+00:00", "Z")
        return str(v)

    r = get_redis()
    await r.set(key, json.dumps(value, default=_default), ex=ttl)


async def cache_delete(*keys: str) -> None:
    if not keys:
        return
    r = get_redis()
    await r.delete(*keys)


async def cache_delete_prefix(prefix: str) -> None:
    r = get_redis()
    async for key in r.scan_iter(f"{prefix}*"):
        await r.delete(key)
