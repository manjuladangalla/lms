from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import REFRESH_PREFIX, safe_decode

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db=Depends(get_db),
) -> dict:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = safe_decode(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = await db.users.find_one({"_id": payload["sub"]})
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    if user.get("status") == "suspended":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")
    return user


async def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db=Depends(get_db),
) -> dict | None:
    if credentials is None:
        return None
    payload = safe_decode(credentials.credentials)
    if not payload or payload.get("type") != "access":
        return None
    return await db.users.find_one({"_id": payload["sub"]})


def require_role(*roles: str):
    async def checker(user: Annotated[dict, Depends(get_current_user)]) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return checker


require_admin = require_role("admin")
require_staff = require_role("admin", "lecturer")
require_student = require_role("admin", "lecturer", "student")
require_counselor = require_role("admin", "counselor")


async def validate_refresh_token(token: str) -> dict:
    payload = safe_decode(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    r = get_redis()
    stored = await r.get(f"{REFRESH_PREFIX}{payload['sub']}:{payload.get('jti', '')}")
    if stored != "1":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token revoked")
    return payload
