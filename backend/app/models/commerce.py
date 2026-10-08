from datetime import datetime

from pydantic import BaseModel, Field


class MembershipPlanIn(BaseModel):
    """Discount membership: % off all course fees (monthly/yearly billing)."""

    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    discount_percent: int = Field(default=25, ge=0, le=100)
    price: float = Field(ge=0)  # monthly price
    yearly_price: float | None = Field(default=None, ge=0)
    currency: str | None = None
    benefits: list[str] = []
    status: str = "active"
    sort_order: int = 0


class EnrolIn(BaseModel):
    programme_id: str
    method: str = Field(default="manual", pattern="^(free|paypal|manual|admin)$")
    plan_id: str | None = None
    # Scope of the purchase: whole programme (default), one module, or one lesson
    scope_type: str = Field(default="programme", pattern="^(programme|subject|lesson)$")
    scope_id: str | None = None
    # Optional promo code (stacks on top of the membership discount)
    promo_code: str | None = None


class EnrolStatusUpdate(BaseModel):
    status: str = Field(pattern="^(active|revoked|cancelled|expired)$")
    reason: str | None = None


class SubscribeIn(BaseModel):
    plan_id: str
    method: str = Field(default="manual", pattern="^(paypal|manual|admin)$")
    cycle: str = Field(default="monthly", pattern="^(monthly|yearly)$")


class PromoIn(BaseModel):
    code: str = Field(min_length=3, max_length=40, pattern="^[A-Za-z0-9_-]+$")
    discount_percent: int = Field(ge=1, le=100)
    scope: str = Field(default="all", pattern="^(all|programme)$")
    programme_id: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_uses: int | None = Field(default=None, ge=1)
    status: str = Field(default="active", pattern="^(active|inactive)$")


class PricingPreviewIn(BaseModel):
    """Server-side price quote: membership discount + promo stack."""

    programme_id: str
    scope_type: str = Field(default="programme", pattern="^(programme|subject|lesson)$")
    scope_id: str | None = None
    promo_code: str | None = None


class PaymentVerifyManual(BaseModel):
    status: str = Field(pattern="^(succeeded|failed|refunded)$")
    notes: str | None = None


class PayPalCreateIn(BaseModel):
    purpose: str = Field(pattern="^(enrolment|membership)$")
    target_id: str
    return_url: str
    cancel_url: str


class PayPalCaptureIn(BaseModel):
    order_id: str
    purpose: str = Field(pattern="^(enrolment|membership)$")
    target_id: str
