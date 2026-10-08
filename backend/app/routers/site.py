from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.database import get_db
from app.core.deps import get_optional_user, require_admin
from app.events import emit
from app.models.common import MessageOut, Page, serialize, serialize_many
from app.models.site import BannerIn, ContactIn, MessageStatusIn, PageIn, SettingsIn
from app.services.cache import get_cached, invalidate_public_cache, set_cached

router = APIRouter(tags=["site"])

SETTINGS_KEY = "settings:public"
DEFAULT_SETTINGS = {
    "site_name": "LMS Institute",
    "tagline": "Learn. Grow. Get Certified.",
    "logo_url": None,
    "favicon_url": None,
    "primary_color": "#2563eb",
    "contact_email": "info@example.com",
    "contact_phone": "",
    "address": "",
    "facebook": "",
    "youtube": "",
    "linkedin": "",
    "instagram": "",
    "manual_payment_instructions": "",
    "currency": "USD",
    "currencies": "USD,EUR,GBP,LKR,INR",
    "footer_text": "",
    "about_body": "",
    "home_hero_title": "Build Skills That Matter",
    "home_hero_subtitle": "Explore classes, courses and diploma programmes with expert lecturers and earn verified digital certificates.",
    "certificate_issuer": "",
}


async def get_settings_doc(db) -> dict:
    doc = await db.settings.find_one({"_id": "institute"}) or {}
    return {**DEFAULT_SETTINGS, **{k: v for k, v in doc.items() if k != "_id"}}


@router.get("/settings")
async def public_settings():
    cached = await get_cached(SETTINGS_KEY)
    if cached:
        return cached
    db = get_db()
    doc = await get_settings_doc(db)
    out = {k: v for k, v in doc.items() if k != "_id"}
    from app.core.system_config import get_system_config

    gcfg = (await get_system_config())["google"]
    out["google_client_id"] = (gcfg.get("client_id") or None) if gcfg.get("enabled") else None
    out["paypal_configured"] = False
    from app.core.config import settings as app_settings

    out["paypal_configured"] = bool(app_settings.paypal_client_id)
    await set_cached(SETTINGS_KEY, out, ttl=300)
    return out


@router.put("/settings")
async def update_settings(body: SettingsIn, _: dict = Depends(require_admin)):
    db = get_db()
    data = body.model_dump()
    await db.settings.update_one(
        {"_id": "institute"}, {"$set": data, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}}, upsert=True
    )
    await invalidate_public_cache()
    await emit("public", "settings.changed", {})
    return await get_settings_doc(db)


# ---------------- Home banners (colourful hero carousel) ----------------

BANNERS_KEY = "banners:active"


@router.get("/banners")
async def list_banners(active_only: bool = True, user: dict | None = Depends(get_optional_user)):
    if not active_only:
        if not user or user.get("role") != "admin":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
        docs = await get_db().banners.find({}).sort([("sort_order", 1), ("created_at", -1)]).to_list(length=200)
        return serialize_many(docs)
    cached = await get_cached(BANNERS_KEY)
    if cached is not None:
        return cached
    db = get_db()
    docs = await db.banners.find({"active": True}).sort([("sort_order", 1), ("created_at", -1)]).to_list(length=50)
    out = serialize_many(docs)
    await set_cached(BANNERS_KEY, out, ttl=300)
    return out


@router.post("/banners", response_model=dict)
async def create_banner(body: BannerIn, _: dict = Depends(require_admin)):
    db = get_db()
    doc = body.model_dump()
    doc["_id"] = uuid4().hex
    doc["created_at"] = datetime.now(timezone.utc)
    doc["updated_at"] = datetime.now(timezone.utc)
    await db.banners.insert_one(doc)
    await invalidate_public_cache()
    await emit("public", "banners.changed", {})
    return serialize(doc)


@router.put("/banners/{banner_id}", response_model=dict)
async def update_banner(banner_id: str, body: BannerIn, _: dict = Depends(require_admin)):
    db = get_db()
    doc = await db.banners.find_one({"_id": banner_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Banner not found")
    data = body.model_dump()
    data["updated_at"] = datetime.now(timezone.utc)
    await db.banners.update_one({"_id": banner_id}, {"$set": data})
    doc.update(data)
    await invalidate_public_cache()
    await emit("public", "banners.changed", {})
    return serialize(doc)


@router.delete("/banners/{banner_id}", response_model=MessageOut)
async def delete_banner(banner_id: str, _: dict = Depends(require_admin)):
    db = get_db()
    await db.banners.delete_one({"_id": banner_id})
    await invalidate_public_cache()
    await emit("public", "banners.changed", {})
    return MessageOut(message="Banner deleted")


@router.get("/pages")
async def list_pages():
    cached = await get_cached("pages:list")
    if cached is not None:
        return cached
    db = get_db()
    docs = await db.pages.find({"published": True}).to_list(length=200)
    out = serialize_many(docs)
    await set_cached("pages:list", out, ttl=300)
    return out


@router.get("/pages/{slug}")
async def get_page(slug: str):
    key = f"page:{slug}"
    cached = await get_cached(key)
    if cached is not None:
        return cached
    db = get_db()
    doc = await db.pages.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Page not found")
    out = serialize(doc)
    await set_cached(key, out, ttl=300)
    return out


@router.post("/pages")
async def create_page(body: PageIn, _: dict = Depends(require_admin)):
    db = get_db()
    existing = await db.pages.find_one({"slug": body.slug})
    data = body.model_dump()
    data["updated_at"] = datetime.now(timezone.utc)
    if existing:
        await db.pages.update_one({"_id": existing["_id"]}, {"$set": data})
        doc = await db.pages.find_one({"_id": existing["_id"]})
    else:
        data["_id"] = uuid4().hex
        data["created_at"] = datetime.now(timezone.utc)
        await db.pages.insert_one(data)
        doc = data
    await invalidate_public_cache()
    return serialize(doc)


@router.put("/pages/{slug}")
async def update_page(slug: str, body: PageIn, _: dict = Depends(require_admin)):
    db = get_db()
    doc = await db.pages.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Page not found")
    data = body.model_dump()
    data["updated_at"] = datetime.now(timezone.utc)
    await db.pages.update_one({"_id": doc["_id"]}, {"$set": data})
    await invalidate_public_cache()
    return serialize(await db.pages.find_one({"_id": doc["_id"]}))


@router.delete("/pages/{slug}", response_model=MessageOut)
async def delete_page(slug: str, _: dict = Depends(require_admin)):
    db = get_db()
    result = await db.pages.delete_one({"slug": slug})
    if result.deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Page not found")
    await invalidate_public_cache()
    return MessageOut(message="Page deleted")


@router.post("/contact")
async def create_message(body: ContactIn, request: Request):
    db = get_db()
    doc = body.model_dump()
    doc["_id"] = uuid4().hex
    doc["status"] = "new"
    doc["ip"] = request.client.host if request.client else None
    doc["created_at"] = datetime.now(timezone.utc)
    await db.contact_messages.insert_one(doc)
    return MessageOut(message="Message sent")


@router.get("/messages", response_model=Page[dict])
async def list_messages(_: dict = Depends(require_admin), page: int = 1, size: int = 20, status_: str | None = None):
    db = get_db()
    query = {"status": status_} if status_ else {}
    total = await db.contact_messages.count_documents(query)
    cursor = db.contact_messages.find(query).sort("created_at", -1).skip((page - 1) * size).limit(size)
    return Page[dict](items=serialize_many(await cursor.to_list(length=size)), total=total, page=page, size=size)


@router.patch("/messages/{message_id}", response_model=MessageOut)
async def update_message(message_id: str, body: MessageStatusIn, _: dict = Depends(require_admin)):
    db = get_db()
    result = await db.contact_messages.update_one({"_id": message_id}, {"$set": {"status": body.status}})
    if result.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    return MessageOut(message="Message updated")
