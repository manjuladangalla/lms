from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, validate_refresh_token
from app.core.redis import get_redis
from app.core.security import (
    REFRESH_PREFIX,
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.models.auth import (
    GoogleAuthIn,
    LoginIn,
    PasswordChangeIn,
    RefreshIn,
    RegisterIn,
    ResendOtpIn,
    ThemeIn,
    VerifyOtpIn,
)
from app.models.common import MessageOut, serialize
from app.models.auth import UserOut
from app.services import email as email_service

router = APIRouter(prefix="/auth", tags=["auth"])

OTP_PREFIX = "otp:"


async def _create_otp(email: str) -> str:
    import random as _random

    from app.core.system_config import get_system_config

    mail = (await get_system_config())["mail"]
    length = int(mail.get("otp_length") or 6)
    ttl = int(mail.get("otp_ttl_seconds") or 600)
    code = "".join(str(_random.randint(0, 9)) for _ in range(length))
    r = get_redis()
    await r.set(f"{OTP_PREFIX}{email.lower()}", code, ex=ttl)
    return code


async def _issue_tokens(db, user: dict) -> dict:
    access = create_access_token(user["_id"], user.get("role", "student"))
    refresh, expire = create_refresh_token(user["_id"])
    jti = refresh.split(".")[1] if False else None
    from jose import jwt as jose_jwt

    payload = jose_jwt.decode(refresh, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    jti = payload.get("jti", "")
    r = get_redis()
    ttl = int((expire - datetime.now(timezone.utc)).total_seconds())
    await r.set(f"{REFRESH_PREFIX}{user['_id']}:{jti}", "1", ex=max(ttl, 60))
    safe_user = serialize(user)
    safe_user.pop("password_hash", None)
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": safe_user,
    }


async def _send_otp_email(db, email: str, name: str) -> dict:
    from app.core.system_config import get_system_config

    code = await _create_otp(email)
    settings_doc = await db.settings.find_one({"_id": "institute"}) or {}
    site_name = settings_doc.get("site_name", "LMS")
    mail = (await get_system_config())["mail"]
    ttl_min = max(1, int(mail.get("otp_ttl_seconds") or 600) // 60)
    sent = await email_service.send_email(
        email,
        f"{site_name} — verify your email",
        email_service.otp_email_html(code, site_name, ttl_min),
    )
    out: dict = {"requires_verification": True, "email": email, "email_sent": sent}
    # Local/dev helper: when SMTP is not configured, expose the code so testing works
    if not sent and settings.debug:
        out["dev_otp"] = code
    return out


@router.post("/register")
async def register(body: RegisterIn):
    db = get_db()
    exists = await db.users.find_one({"email": body.email.lower()})
    if exists:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")
    user = {
        "_id": uuid4().hex,
        "name": body.name,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "phone": body.phone,
        "role": "student",
        "status": "active",
        "theme": "normal",
        "avatar_url": None,
        "google_id": None,
        "email_verified": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user)
    return await _send_otp_email(db, user["email"], user["name"])


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpIn):
    db = get_db()
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    if user.get("email_verified"):
        return await _issue_tokens(db, user)
    r = get_redis()
    stored = await r.get(f"{OTP_PREFIX}{email}")
    if not stored or stored != body.code.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification code")
    await r.delete(f"{OTP_PREFIX}{email}")
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"email_verified": True, "updated_at": datetime.now(timezone.utc)}},
    )
    user["email_verified"] = True
    return await _issue_tokens(db, user)


@router.post("/resend-otp", response_model=MessageOut)
async def resend_otp(body: ResendOtpIn):
    db = get_db()
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    if user.get("email_verified"):
        return MessageOut(message="Email already verified")
    await _send_otp_email(db, email, user.get("name") or "")
    return MessageOut(message="Verification code sent")


@router.post("/login")
async def login(body: LoginIn):
    db = get_db()
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if user.get("status") == "suspended":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")
    # Two-way verification: students must verify email before first login.
    # Missing field (legacy/admin/OAuth users) is treated as verified.
    if user.get("email_verified") is False and user.get("google_id") is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Email not verified. Check your inbox for the verification code.",
        )
    return await _issue_tokens(db, user)


@router.post("/refresh")
async def refresh(body: RefreshIn):
    payload = await validate_refresh_token(body.refresh_token)
    db = get_db()
    user = await db.users.find_one({"_id": payload["sub"]})
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    r = get_redis()
    await r.delete(f"{REFRESH_PREFIX}{payload['sub']}:{payload.get('jti', '')}")
    return await _issue_tokens(db, user)


@router.post("/logout", response_model=MessageOut)
async def logout(body: RefreshIn):
    try:
        payload = await validate_refresh_token(body.refresh_token)
        r = get_redis()
        await r.delete(f"{REFRESH_PREFIX}{payload['sub']}:{payload.get('jti', '')}")
    except HTTPException:
        pass
    return MessageOut(message="Logged out")


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return serialize(user)


@router.patch("/me", response_model=UserOut)
async def update_me(body: dict, user: dict = Depends(get_current_user)):
    db = get_db()
    allowed = {k: v for k, v in body.items() if k in ("name", "phone", "avatar_url")}
    if user.get("role") == "counselor":
        allowed.update(
            {
                k: v
                for k, v in body.items()
                if k in ("specialty", "bio") and isinstance(v, str) and len(v) <= (160 if k == "specialty" else 1000)
            }
        )
    if allowed:
        allowed["updated_at"] = datetime.now(timezone.utc)
        await db.users.update_one({"_id": user["_id"]}, {"$set": allowed})
        user.update(allowed)
    return serialize(user)


@router.patch("/theme", response_model=MessageOut)
async def set_theme(body: ThemeIn, user: dict = Depends(get_current_user)):
    db = get_db()
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"theme": body.theme, "updated_at": datetime.now(timezone.utc)}},
    )
    return MessageOut(message="Theme updated", detail={"theme": body.theme})


@router.post("/password", response_model=MessageOut)
async def change_password(body: PasswordChangeIn, user: dict = Depends(get_current_user)):
    if not user.get("password_hash") or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    db = get_db()
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    return MessageOut(message="Password changed")


async def _upsert_oauth_user(db, email: str, name: str, google_id: str, avatar: str | None) -> dict:
    user = await db.users.find_one({"email": email.lower()})
    if user:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"google_id": google_id, "email_verified": True, "avatar_url": user.get("avatar_url") or avatar}},
        )
        user = await db.users.find_one({"_id": user["_id"]})
        return user
    user = {
        "_id": uuid4().hex,
        "name": name,
        "email": email.lower(),
        "password_hash": None,
        "phone": None,
        "role": "student",
        "status": "active",
        "theme": "normal",
        "avatar_url": avatar,
        "google_id": google_id,
        "email_verified": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user)
    return user


@router.post("/google")
async def google_auth(body: GoogleAuthIn):
    from app.core.system_config import get_system_config

    gcfg = (await get_system_config())["google"]
    google_client_id = gcfg.get("client_id") or ""
    google_client_secret = gcfg.get("client_secret") or ""
    if not gcfg.get("enabled") or not google_client_id:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google OAuth is not configured")
    db = get_db()
    info: dict = {}
    if body.id_token:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": body.id_token},
            )
            if resp.status_code != 200:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google token")
            info = resp.json()
        if info.get("aud") not in (google_client_id, None) and info.get("aud") != google_client_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google audience")
    elif body.code:
        async with httpx.AsyncClient(timeout=20) as client:
            token_resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": body.code,
                    "client_id": google_client_id,
                    "client_secret": google_client_secret,
                    "redirect_uri": body.redirect_uri or "",
                    "grant_type": "authorization_code",
                },
            )
            if token_resp.status_code != 200:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google code exchange failed")
            id_token = token_resp.json().get("id_token")
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo", params={"id_token": id_token}
            )
            info = resp.json()
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "id_token or code required")

    email = info.get("email")
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Google account has no email")
    user = await _upsert_oauth_user(
        db, email, info.get("name") or email.split("@")[0], info.get("sub", ""), info.get("picture")
    )
    if user.get("status") == "suspended":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")
    return await _issue_tokens(db, user)
