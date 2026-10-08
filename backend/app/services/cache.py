from app.core.redis import cache_delete, cache_delete_prefix, cache_get, cache_set

CACHE_TTL = 120
PUBLIC_KEYS = {
    "settings:public",
    "pages:list",
    "programmes:published",
    "membership_plans:active",
    "membership_plans:all",
    "banners:active",
}


async def get_cached(key: str):
    return await cache_get(key)


async def set_cached(key: str, value, ttl: int = CACHE_TTL):
    await cache_set(key, value, ttl)


async def invalidate_public_cache():
    await cache_delete(*PUBLIC_KEYS)
    await cache_delete_prefix("programme:")
    await cache_delete_prefix("programmes:list:")
    await cache_delete_prefix("verify:")


async def invalidate(key: str):
    await cache_delete(key)
