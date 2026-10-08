from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

RoleLiteral = Literal["admin", "lecturer", "counselor", "student"]


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    phone: str = Field(min_length=5, max_length=32)


class VerifyOtpIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


class ResendOtpIn(BaseModel):
    email: EmailStr


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthIn(BaseModel):
    id_token: str | None = None
    code: str | None = None
    redirect_uri: str | None = None


class RefreshIn(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None = None
    avatar_url: str | None = None
    role: str
    status: str = "active"
    theme: str = "normal"
    specialty: str | None = None
    bio: str | None = None
    google_id: str | None = None
    email_verified: bool = False
    created_at: datetime | None = None


class UserAdminUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    role: RoleLiteral | None = None
    status: str | None = None
    specialty: str | None = Field(default=None, max_length=160)
    bio: str | None = Field(default=None, max_length=1000)


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


class ThemeIn(BaseModel):
    theme: str = Field(pattern="^(light|dark|normal)$")
