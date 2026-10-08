from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.core.deps import get_current_user, require_staff
from app.models.common import MessageOut
from app.services.storage import upload_bytes

router = APIRouter(prefix="/upload", tags=["upload"])

MAX_SIZE = 50 * 1024 * 1024


def _ext(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    prefix: str = Form("misc"),
    user: dict = Depends(get_current_user),
):
    if user.get("role") not in ("admin", "lecturer", "counselor", "student"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large (max 50MB)")
    safe_prefix = "".join(c for c in prefix if c.isalnum() or c in "-_/") or "misc"
    if user.get("role") == "student":
        safe_prefix = f"students/{user['_id']}/{safe_prefix}"
    url = await upload_bytes(data, safe_prefix, file.content_type)
    if not url:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "File storage is not configured — check System → Storage (super admin)",
        )
    return {"url": url, "filename": file.filename, "size": len(data), "mime": file.content_type}
