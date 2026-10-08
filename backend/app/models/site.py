from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class MarkCompleteIn(BaseModel):
    lesson_id: str
    programme_id: str


class CertificateIssueIn(BaseModel):
    user_id: str
    programme_id: str


class CertificateUpdateIn(BaseModel):
    """Per-certificate print value overrides (blank string clears an override)."""

    print_values: dict[str, str] = {}


class CertificateRegenerateIn(BaseModel):
    mode: Literal["all", "print", "system"] = "all"


class CertFieldIn(BaseModel):
    """Partial field update — omitted/None values keep their current/default position."""

    x: float | None = Field(default=None, ge=0, le=2000)
    y: float | None = Field(default=None, ge=0, le=2000)
    size: float | None = Field(default=None, ge=4, le=200)
    align: Literal["left", "center", "right"] | None = None
    visible: bool | None = None


class CertificateTemplateIn(BaseModel):
    page: dict[str, float] | None = None
    fields: dict[str, CertFieldIn] = {}


class SettingsIn(BaseModel):
    site_name: str = "LMS Institute"
    tagline: str = ""
    logo_url: str | None = None
    favicon_url: str | None = None
    primary_color: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    facebook: str | None = None
    youtube: str | None = None
    linkedin: str | None = None
    instagram: str | None = None
    manual_payment_instructions: str = ""
    currency: str = "USD"
    # Comma-separated currencies admin/lecturers can pick for courses & plans
    currencies: str = "USD,EUR,GBP,LKR,INR"
    footer_text: str = ""
    about_body: str = ""
    home_hero_title: str = ""
    home_hero_subtitle: str = ""
    certificate_issuer: str = ""


class BannerIn(BaseModel):
    """Colourful home-page hero banner (theme = named gradient preset)."""

    title: str = Field(min_length=1, max_length=150)
    subtitle: str = ""
    image_url: str | None = None
    link_url: str | None = None
    cta_text: str = ""
    theme: str = Field(default="ocean", pattern="^(ocean|sunset|violet|emerald|rose|amber|sky|forest)$")
    sort_order: int = 0
    active: bool = True


class PageIn(BaseModel):
    slug: str = Field(min_length=1, max_length=60, pattern="^[a-z0-9-]+$")
    title: str = ""
    subtitle: str = ""
    body: str = ""
    sections: list[dict[str, Any]] = []
    published: bool = True


class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=200)
    phone: str | None = None
    subject: str | None = None
    message: str = Field(min_length=5, max_length=5000)


class MessageStatusIn(BaseModel):
    status: str = Field(pattern="^(new|read|replied)$")


class CertificateOut(BaseModel):
    id: str
    cert_no: str
    student_name: str
    programme_name: str
    programme_type: str | None = None
    completion_date: datetime | None = None
    final_grade: float | None = None
    status: str
    issued_at: datetime | None = None
    qr_url: str | None = None
    pdf_url: str | None = None
    print_pdf_url: str | None = None
    verify_url: str | None = None


class VerifyOut(BaseModel):
    valid: bool
    certificate: dict[str, Any] | None = None
    message: str
