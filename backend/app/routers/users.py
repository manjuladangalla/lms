from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.database import get_db
from app.core.deps import require_admin, require_staff
from app.core.security import hash_password
from app.models.auth import UserAdminUpdate, UserOut, clean_identity
from app.models.common import MessageOut, Page, serialize, serialize_many
from app.services.student_numbers import next_student_number

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=Page[UserOut])
async def list_users(
    actor: dict = Depends(require_staff),
    q: str | None = None,
    role: str | None = None,
    status_: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """List users. Admins see every role (needed by the Users page); lecturers
    only see students, so they can search for one when issuing a certificate."""
    db = get_db()
    is_admin = actor["role"] == "admin"
    query: dict = {}
    if not is_admin:
        role = "student"
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"student_number": {"$regex": q, "$options": "i"}},
            {"nic_number": {"$regex": q, "$options": "i"}},
            {"passport_number": {"$regex": q, "$options": "i"}},
        ]
    if role:
        query["role"] = role
    if status_:
        query["status"] = status_
    total = await db.users.count_documents(query)
    cursor = db.users.find(query).sort("created_at", -1).skip((page - 1) * size).limit(size)
    return Page[UserOut](
        items=serialize_many(await cursor.to_list(length=size)),
        total=total,
        page=page,
        size=size,
    )


@router.post("", response_model=UserOut)
async def create_user(body: dict, _: dict = Depends(require_admin)):
    db = get_db()
    email = (body.get("email") or "").lower()
    if not email or not body.get("name"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "name and email required")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already exists")
    role = body.get("role") or "student"
    if role not in ("admin", "lecturer", "counselor", "student", "parent"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "role must be admin, lecturer, counselor, student or parent")
    status_val = body.get("status") or "active"
    if status_val not in ("active", "suspended"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "status must be active or suspended")
    user = {
        "_id": uuid4().hex,
        "name": body["name"],
        "email": email,
        "password_hash": hash_password(body.get("password") or "changeme123"),
        "phone": body.get("phone"),
        "role": role,
        "status": status_val,
        "theme": "normal",
        "avatar_url": None,
        "specialty": (body.get("specialty") or None) if role == "counselor" else None,
        "bio": (body.get("bio") or None) if role == "counselor" else None,
        "google_id": None,
        "email_verified": True,
        # Auto-generated for students only, e.g. STU-00001
        "student_number": await next_student_number(db) if role == "student" else None,
        "nic_number": clean_identity(body.get("nic_number")),
        "passport_number": clean_identity(body.get("passport_number")),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user)
    return serialize(user)


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: str, _: dict = Depends(require_admin)):
    db = get_db()
    user = await db.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return serialize(user)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(user_id: str, body: UserAdminUpdate, _: dict = Depends(require_admin)):
    db = get_db()
    user = await db.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    data = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    for key in ("nic_number", "passport_number"):
        if key in data:
            data[key] = clean_identity(data[key])  # blank clears the value
    if data:
        data["updated_at"] = datetime.now(timezone.utc)
        await db.users.update_one({"_id": user_id}, {"$set": data})
        user.update(data)
    return serialize(user)


@router.delete("/{user_id}", response_model=MessageOut)
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["_id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete yourself")
    db = get_db()
    result = await db.users.delete_one({"_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return MessageOut(message="User deleted")
