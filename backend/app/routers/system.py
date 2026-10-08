from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_db
from app.core.deps import require_admin
from app.core.system_config import SYSTEM_DOC_ID, get_system_config, invalidate_system_config, mask_config
from app.models.system import SystemConfigIn, TestMailIn
from app.services import email as email_service
from app.services.storage import upload_bytes, storage_info

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/config")
async def get_config(_: dict = Depends(require_admin)):
    cfg = await get_system_config()
    out = mask_config(cfg)
    out["storage"]["test"] = storage_info(cfg["storage"])
    return out


@router.put("/config")
async def update_config(body: SystemConfigIn, _: dict = Depends(require_admin)):
    db = get_db()
    doc = await db.settings.find_one({"_id": SYSTEM_DOC_ID}) or {"_id": SYSTEM_DOC_ID}
    for section in ("storage", "zoom", "google", "mail"):
        incoming = getattr(body, section)
        if incoming is None:
            continue
        data = incoming.model_dump(exclude_none=True)
        # secrets: None (excluded above) keeps existing value; "" clears it
        merged = dict(doc.get(section) or {})
        merged.update(data)
        doc[section] = merged
    doc["updated_at"] = datetime.now(timezone.utc)
    doc.setdefault("created_at", doc["updated_at"])
    await db.settings.update_one(
        {"_id": SYSTEM_DOC_ID}, {"$set": doc}, upsert=True
    )
    invalidate_system_config()
    cfg = await get_system_config()
    out = mask_config(cfg)
    out["storage"]["test"] = storage_info(cfg["storage"])
    return out


@router.post("/config/test-mail")
async def test_mail(body: TestMailIn, _: dict = Depends(require_admin)):
    cfg = await get_system_config()
    mail = cfg["mail"]
    if not mail.get("enabled") or not mail.get("host"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Mail is not enabled/configured. Save the Mail tab first.",
        )
    ok = await email_service.send_email(
        body.to,
        "LMS test email",
        "<p>This is a test email from your LMS. SMTP configuration works.</p>",
    )
    if not ok:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "SMTP send failed — check host/port/credentials")
    return {"sent": True, "to": body.to}


@router.post("/config/test-storage")
async def test_storage(_: dict = Depends(require_admin)):
    cfg = await get_system_config()
    url = await upload_bytes(b"lms storage test", "system/test", "text/plain")
    if not url:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Storage not configured — for S3 fill in access key/secret/bucket",
        )
    return {"ok": True, "url": url, "backend": cfg["storage"].get("backend")}
