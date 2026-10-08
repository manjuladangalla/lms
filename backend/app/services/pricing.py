"""Stacked pricing: membership discount first, then promo code off the remainder.

Final = base * (1 - member%) * (1 - promo%)
"""
from datetime import datetime, timezone

from app.services.progress import active_membership

# Access length per subscription billing period
INTERVAL_DAYS = {"weekly": 7, "monthly": 30, "semester": 120, "yearly": 365}


def interval_days(interval: str | None) -> int:
    return INTERVAL_DAYS.get(interval or "monthly", 30)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def member_discount_percent(db, user: dict | None) -> int:
    """Active membership plan's % discount (0 when no active membership)."""
    if not user:
        return 0
    m = await active_membership(db, user["_id"])
    if not m:
        return 0
    plan = await db.membership_plans.find_one({"_id": m.get("plan_id")})
    if not plan:
        return 0
    return int(plan.get("discount_percent") or 0)


async def find_promo(db, code: str, programme_id: str) -> tuple[dict | None, str | None]:
    """Validate a promo code for a programme → (promo, None) or (None, error)."""
    code = (code or "").strip()
    if not code:
        return None, "Promo code is required"
    promo = await db.promos.find_one({"code": {"$regex": f"^{code}$", "$options": "i"}})
    if not promo:
        return None, "Invalid promo code"
    if promo.get("status") != "active":
        return None, "This promo code is no longer active"
    now = datetime.now(timezone.utc)
    starts = _aware(promo.get("starts_at"))
    ends = _aware(promo.get("ends_at"))
    if starts and now < starts:
        return None, "This promo code is not active yet"
    if ends and now > ends:
        return None, "This promo code has expired"
    if promo.get("scope") == "programme" and promo.get("programme_id") != programme_id:
        return None, "This promo code does not apply to this course"
    max_uses = promo.get("max_uses")
    if max_uses is not None and int(promo.get("used_count") or 0) >= int(max_uses):
        return None, "This promo code has reached its usage limit"
    return promo, None


async def quote_price(
    db,
    *,
    base: float,
    user: dict | None,
    programme: dict,
    promo_code: str | None = None,
) -> dict:
    """Price breakdown for a purchase (membership + promo stack)."""
    currency = programme.get("currency") or "USD"
    base = round(float(base or 0), 2)
    member_pct = await member_discount_percent(db, user)

    promo: dict | None = None
    promo_error: str | None = None
    promo_pct = 0
    if promo_code and promo_code.strip():
        promo, promo_error = await find_promo(db, promo_code, programme["_id"])
        if promo:
            promo_pct = int(promo.get("discount_percent") or 0)

    after_member = round(base * (100 - member_pct) / 100, 2)
    final = round(after_member * (100 - promo_pct) / 100, 2)
    return {
        "base_amount": base,
        "currency": currency,
        "member_discount_percent": member_pct,
        "promo_code": promo.get("code") if promo else None,
        "promo_discount_percent": promo_pct,
        "promo_error": promo_error,
        "amount": final,
    }


async def claim_promo(db, quote: dict) -> None:
    """Increment usage for a successfully applied promo."""
    if quote.get("promo_code"):
        await db.promos.update_one({"code": quote["promo_code"]}, {"$inc": {"used_count": 1}})
