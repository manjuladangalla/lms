from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import close_db, connect_db, get_db
from app.core.redis import close_redis, connect_redis
from app.events import router as events_router, start_events, stop_events
from app.routers import assignments, auth, commerce, content, counselling, dashboard, learning, live, site, system, upload, users
from app.services.storage import ensure_bucket


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    try:
        await connect_redis()
    except Exception as exc:
        print(f"[warn] Redis unavailable: {exc}")
    # Idempotent role migration: legacy "instructor" → "lecturer"
    try:
        result = await get_db().users.update_many({"role": "instructor"}, {"$set": {"role": "lecturer"}})
        if result.modified_count:
            print(f"[migrate] renamed {result.modified_count} user(s): role instructor -> lecturer")
    except Exception as exc:
        print(f"[warn] role migration skipped: {exc}")
    await ensure_bucket()
    await start_events()
    yield
    await stop_events()
    await close_redis()
    await close_db()


app = FastAPI(title=settings.app_name, lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc) if settings.debug else "Internal server error"})


@app.get("/health")
async def health():
    return {"status": "ok"}


api = settings.api_prefix
app.include_router(auth.router, prefix=api)
app.include_router(users.router, prefix=api)
app.include_router(site.router, prefix=api)
app.include_router(system.router, prefix=api)
app.include_router(upload.router, prefix=api)
app.include_router(content.router, prefix=api)
app.include_router(commerce.router, prefix=api)
app.include_router(learning.router, prefix=api)
app.include_router(live.router, prefix=api)
app.include_router(assignments.router, prefix=api)
app.include_router(counselling.router, prefix=api)
app.include_router(dashboard.router, prefix=api)
app.include_router(events_router, prefix=api)


@app.get("/media/{key:path}")
async def serve_local_media(key: str):
    """Serve locally stored files (storage backend = local)."""
    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    from app.core.system_config import get_system_config

    cfg = (await get_system_config())["storage"]
    root = Path(cfg.get("local_dir") or settings.upload_dir).resolve()
    path = (root / key).resolve()
    if not str(path).startswith(str(root)) or not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")

    with path.open("rb") as f:
        head = f.read(16)
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        media_type = "image/png"
    elif head.startswith(b"%PDF"):
        media_type = "application/pdf"
    elif head.startswith(b"\xff\xd8\xff"):
        media_type = "image/jpeg"
    elif head.startswith((b"GIF87a", b"GIF89a")):
        media_type = "image/gif"
    elif head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        media_type = "image/webp"
    else:
        import mimetypes

        media_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type)
