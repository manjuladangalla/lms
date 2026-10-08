import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user, require_admin
from app.events import emit
from app.models.commerce import (
    EnrolIn,
    EnrolStatusUpdate,
    MembershipPlanIn,
    PayPalCaptureIn,
    PayPalCreateIn,
    PaymentVerifyManual,
    PricingPreviewIn,
    PromoIn,
    SubscribeIn,
)
from app.models.common import MessageOut, Page, serialize, serialize_many
from app.services import paypal as paypal_service
from app.services.cache import get_cached, invalidate_public_cache, set_cached
from app.services.pricing import claim_promo, interval_days, quote_price
from app.services.storage import upload_bytes

router = APIRouter(tags=["commerce"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _activate_target(db, payment: dict, actor: dict | None = None) -> None:
    if payment.get("purpose") == "enrolment":
        set_: dict = {"status": "active", "source": payment.get("provider", "manual"), "payment_id": payment["_id"]}
        enrol = await db.enrolments.find_one({"_id": payment["target_id"]})
        # Subscription renewals: the paid period starts when payment is verified
        if enrol and enrol.get("billing_interval") and enrol.get("access_expires_at"):
            set_["access_expires_at"] = _now() + timedelta(days=interval_days(enrol["billing_interval"]))
        await db.enrolments.update_one(
            {"_id": payment["target_id"]},
            {"$set": set_},
        )
        if enrol:
            await emit("user:{user_id}".format(user_id=enrol["user_id"]), "enrolment.updated", {"enrolment_id": enrol["_id"], "programme_id": enrol["programme_id"], "status": "active"})
            await emit("admin", "enrolment.updated", {"enrolment_id": enrol["_id"], "programme_id": enrol.get("programme_id")})
    elif payment.get("purpose") == "membership":
        m = await db.memberships.find_one({"_id": payment["target_id"]})
        if m:
            expires = _now() + timedelta(days=m.get("duration_days") or 30)
            await db.memberships.update_one(
                {"_id": m["_id"]},
                {
                    "$set": {
                        "status": "active",
                        "payment_id": payment["_id"],
                        "started_at": _now(),
                        "expires_at": expires,
                    }
                },
            )
            await emit("user:{user_id}".format(user_id=m["user_id"]), "membership.updated", {"membership_id": m["_id"], "status": "active"})
            await emit("admin", "membership.updated", {"membership_id": m["_id"], "status": "active"})


async def _create_payment(db, *, user_id: str, amount: float, currency: str, purpose: str, target_id: str, provider: str, status_: str) -> dict:
    payment = {
        "_id": uuid4().hex,
        "user_id": user_id,
        "provider": provider,
        "provider_ref": None,
        "amount": amount,
        "currency": currency,
        "status": status_,
        "purpose": purpose,
        "target_id": target_id,
        "proof_url": None,
        "verified_by": None,
        "verified_at": None,
        "notes": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.payments.insert_one(payment)
    await emit("admin", "payment.created", {"payment_id": payment["_id"], "amount": amount, "currency": currency, "purpose": purpose})
    await emit("user:{user_id}".format(user_id=user_id), "payment.updated", {"payment_id": payment["_id"], "status": status_})
    return payment


# ---------------- Membership plans ----------------

@router.get("/membership-plans")
async def list_plans(active_only: bool = True):
    cache_key = "membership_plans:active" if active_only else "membership_plans:all"
    cached = await get_cached(cache_key)
    if cached:
        return cached
    db = get_db()
    query = {"status": "active"} if active_only else {}
    docs = await db.membership_plans.find(query).sort("sort_order", 1).to_list(length=100)
    out = serialize_many(docs)
    await set_cached(cache_key, out, ttl=120)
    return out


@router.post("/membership-plans", response_model=dict)
async def create_plan(body: MembershipPlanIn, _: dict = Depends(require_admin)):
    db = get_db()
    doc = body.model_dump()
    doc["_id"] = uuid4().hex
    doc["created_at"] = _now()
    await db.membership_plans.insert_one(doc)
    await invalidate_public_cache()
    return serialize(doc)


@router.put("/membership-plans/{plan_id}", response_model=dict)
async def update_plan(plan_id: str, body: MembershipPlanIn, _: dict = Depends(require_admin)):
    db = get_db()
    doc = await db.membership_plans.find_one({"_id": plan_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    data = body.model_dump()
    await db.membership_plans.update_one({"_id": plan_id}, {"$set": data})
    doc.update(data)
    await invalidate_public_cache()
    return serialize(doc)


@router.delete("/membership-plans/{plan_id}", response_model=MessageOut)
async def delete_plan(plan_id: str, _: dict = Depends(require_admin)):
    db = get_db()
    await db.membership_plans.delete_one({"_id": plan_id})
    await invalidate_public_cache()
    return MessageOut(message="Plan deleted")


# ---------------- Enrolments ----------------

async def _scope_doc(db, programme: dict, scope_type: str, scope_id: str | None) -> dict:
    """Validate a subject/lesson scope against the programme and return the doc."""
    if scope_type == "subject":
        doc = await db.subjects.find_one({"_id": scope_id, "programme_id": programme["_id"]})
        if not doc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Module not found in this programme")
        return doc
    if scope_type == "lesson":
        doc = await db.lessons.find_one({"_id": scope_id, "programme_id": programme["_id"]})
        if not doc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lesson not found in this programme")
        return doc
    return programme


def _scope_price(programme: dict, scope_type: str, scope_doc: dict) -> float:
    if scope_type == "subject":
        return float(scope_doc.get("price") or 0)
    if scope_type == "lesson":
        return float(scope_doc.get("price") or 0)
    return float(programme.get("price") or 0)


def _scope_key(scope_type: str, scope_id: str | None) -> str:
    if scope_type == "subject":
        return f"subject:{scope_id}"
    if scope_type == "lesson":
        return f"lesson:{scope_id}"
    return "programme"


async def _enrolment_amount(db, enrolment: dict) -> tuple[float, str, str]:
    """Amount/currency/description for an enrolment based on its scope."""
    programme = await db.programmes.find_one({"_id": enrolment.get("programme_id")})
    currency = (programme.get("currency") or "USD") if programme else "USD"
    title = (programme or {}).get("title", "")
    # Final quoted amount (after membership/promo discounts) wins
    if enrolment.get("amount") is not None:
        desc = f"Enrolment: {title}"
        sk0 = enrolment.get("scope_key") or "programme"
        if sk0.startswith("subject:"):
            s0 = await db.subjects.find_one({"_id": sk0.split(":", 1)[1]})
            desc = f"Module: {(s0 or {}).get('title', '')}"
        elif sk0.startswith("lesson:"):
            l0 = await db.lessons.find_one({"_id": sk0.split(":", 1)[1]})
            desc = f"Lesson: {(l0 or {}).get('title', '')}"
        return float(enrolment["amount"]), currency, desc
    sk = enrolment.get("scope_key") or "programme"
    if sk.startswith("subject:"):
        s = await db.subjects.find_one({"_id": sk.split(":", 1)[1]})
        return float((s or {}).get("price") or 0), currency, f"Module: {(s or {}).get('title', '')}"
    if sk.startswith("lesson:"):
        l = await db.lessons.find_one({"_id": sk.split(":", 1)[1]})
        return float((l or {}).get("price") or 0), currency, f"Lesson: {(l or {}).get('title', '')}"
    return float((programme or {}).get("price") or 0), currency, f"Enrolment: {title}"


@router.post("/enrolments", response_model=dict)
async def enrol(body: EnrolIn, user: dict = Depends(get_current_user)):
    db = get_db()
    programme = await db.programmes.find_one({"_id": body.programme_id})
    if not programme:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not found")
    if programme.get("status") != "published" and user.get("role") not in ("admin", "lecturer"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Programme not available")

    pricing_mode = programme.get("pricing_mode") or "once"
    if body.scope_type == "subject" and pricing_mode != "per_module":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This programme does not sell individual modules")
    if body.scope_type == "lesson" and pricing_mode != "per_lesson":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This programme does not sell individual lessons")

    scope_doc = await _scope_doc(db, programme, body.scope_type, body.scope_id)
    scope_key = _scope_key(body.scope_type, body.scope_id)
    price = _scope_price(programme, body.scope_type, scope_doc)

    # Membership discount first, then promo code off the remainder
    quote = await quote_price(db, base=price, user=user, programme=programme, promo_code=body.promo_code)
    if body.promo_code and body.promo_code.strip() and quote["promo_error"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, quote["promo_error"])
    final_price = quote["amount"]

    # Existing enrolment for the SAME scope (module/lesson/full) — no double payment
    scope_match: dict = {"scope_key": scope_key} if scope_key != "programme" else {"scope_key": {"$in": [None, "programme"]}}
    existing = await db.enrolments.find_one(
        {"user_id": user["_id"], "programme_id": programme["_id"], **scope_match}
    )
    if existing and existing.get("status") in ("active", "pending_verification"):
        return serialize(existing)

    is_free = bool(programme.get("is_free")) or (
        final_price == 0 and not (body.scope_type == "programme" and pricing_mode in ("per_lesson", "per_module"))
    )
    if body.scope_type == "programme" and pricing_mode in ("per_lesson", "per_module") and not programme.get("is_free") and float(programme.get("price") or 0) <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This programme is sold by module/lesson — set a full-programme price or mark it free")
    method = body.method
    if method == "free" and not is_free:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Programme is not free")
    if user.get("role") == "admin" and method == "admin":
        is_free = True

    # Subscription courses: access expires after the billing period, student re-pays to renew
    access_expires_at = None
    billing_interval = None
    if pricing_mode == "subscription" and scope_key == "programme" and not is_free:
        billing_interval = programme.get("billing_interval") or "monthly"
        access_expires_at = _now() + timedelta(days=interval_days(billing_interval))

    now = _now()
    fields = {
        "status": "active" if (is_free or method == "admin") else "pending_verification",
        "source": "free" if is_free else ("admin" if method == "admin" else method),
        "payment_id": None,
        "access_expires_at": access_expires_at,
        "billing_interval": billing_interval,
        "scope_key": scope_key,
        "scope_type": body.scope_type,
        "scope_id": body.scope_id,
        "pricing_mode": pricing_mode,
        "base_amount": quote["base_amount"],
        "amount": quote["amount"],
        "currency": quote["currency"],
        "member_discount_percent": quote["member_discount_percent"],
        "promo_code": quote["promo_code"],
        "promo_discount_percent": quote["promo_discount_percent"],
        "updated_at": now,
    }

    if existing:
        # Renewal / retry: keep _id and progress, refresh the terms
        await db.enrolments.update_one({"_id": existing["_id"]}, {"$set": fields})
        enrolment = {**existing, **fields}
    else:
        enrolment = {
            "_id": uuid4().hex,
            "user_id": user["_id"],
            "programme_id": programme["_id"],
            "progress_percent": 0,
            "total_lessons": 0,
            "completed_lessons": 0,
            "completed_at": None,
            "certificate_id": None,
            "created_at": now,
            **fields,
        }
        await db.enrolments.insert_one(enrolment)

    if method == "manual" and not is_free:
        payment = await _create_payment(
            db,
            user_id=user["_id"],
            amount=quote["amount"],
            currency=quote["currency"],
            purpose="enrolment",
            target_id=enrolment["_id"],
            provider="manual",
            status_="awaiting_verification",
        )
        await db.enrolments.update_one({"_id": enrolment["_id"]}, {"$set": {"payment_id": payment["_id"]}})
        enrolment["payment_id"] = payment["_id"]
    if quote.get("promo_code"):
        await claim_promo(db, quote)
    await emit("admin", "enrolment.created", {"enrolment_id": enrolment["_id"], "programme_id": programme["_id"], "user_id": user["_id"], "amount": quote["amount"], "currency": quote["currency"], "status": enrolment["status"]})
    await emit("user:{user_id}".format(user_id=user["_id"]), "enrolment.created", {"enrolment_id": enrolment["_id"], "programme_id": programme["_id"], "status": enrolment["status"]})
    return serialize(enrolment)


@router.get("/enrolments/mine")
async def my_enrolments(user: dict = Depends(get_current_user)):
    db = get_db()
    await db.enrolments.update_many(
        {
            "user_id": user["_id"],
            "status": "active",
            "access_expires_at": {"$ne": None, "$lt": _now()},
        },
        {"$set": {"status": "expired", "updated_at": _now()}},
    )
    docs = await db.enrolments.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(length=200)
    out = serialize_many(docs)
    for e in out:
        prog = await db.programmes.find_one({"_id": e["programme_id"]})
        e["programme"] = serialize(prog) if prog else None
        if e.get("payment_id"):
            pay = await db.payments.find_one({"_id": e["payment_id"]})
            e["payment"] = serialize(pay) if pay else None
        if e.get("certificate_id"):
            cert = await db.certificates.find_one({"_id": e["certificate_id"]})
            e["certificate"] = serialize(cert) if cert else None
    return out


@router.get("/enrolments", response_model=Page[dict])
async def admin_list_enrolments(
    _: dict = Depends(require_admin),
    status_: str | None = None,
    q: str | None = None,
    page: int = 1,
    size: int = 20,
):
    db = get_db()
    query: dict = {}
    if status_:
        query["status"] = status_
    if q:
        users = await db.users.find({"$or": [{"name": {"$regex": q, "$options": "i"}}, {"email": {"$regex": q, "$options": "i"}}]}).to_list(length=200)
        ids = [u["_id"] for u in users]
        progs = await db.programmes.find({"title": {"$regex": q, "$options": "i"}}).to_list(length=200)
        pids = [p["_id"] for p in progs]
        query["$or"] = [{"user_id": {"$in": ids}}, {"programme_id": {"$in": pids}}]
    total = await db.enrolments.count_documents(query)
    cursor = db.enrolments.find(query).sort("created_at", -1).skip((page - 1) * size).limit(size)
    items = serialize_many(await cursor.to_list(length=size))
    for e in items:
        u = await db.users.find_one({"_id": e["user_id"]})
        p = await db.programmes.find_one({"_id": e["programme_id"]})
        e["student"] = {"id": u["_id"], "name": u["name"], "email": u["email"]} if u else None
        e["programme"] = {"id": p["_id"], "title": p["title"], "type": p["type"], "price": p.get("price")} if p else None
    return Page[dict](items=items, total=total, page=page, size=size)


@router.patch("/enrolments/{enrolment_id}", response_model=dict)
async def update_enrolment(enrolment_id: str, body: EnrolStatusUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    doc = await db.enrolments.find_one({"_id": enrolment_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrolment not found")
    await db.enrolments.update_one(
        {"_id": enrolment_id},
        {"$set": {"status": body.status, "updated_at": _now()}},
    )
    if body.status == "active" and doc.get("payment_id"):
        pay = await db.payments.find_one({"_id": doc["payment_id"]})
        if pay and pay["status"] in ("awaiting_verification", "pending"):
            await db.payments.update_one(
                {"_id": pay["_id"]},
                {"$set": {"status": "succeeded", "verified_by": admin["_id"], "verified_at": _now()}},
            )
    doc["status"] = body.status
    return serialize(doc)


# ---------------- Memberships ----------------

@router.post("/memberships", response_model=dict)
async def subscribe(body: SubscribeIn, user: dict = Depends(get_current_user)):
    db = get_db()
    plan = await db.membership_plans.find_one({"_id": body.plan_id})
    if not plan or plan.get("status") != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    yearly = body.cycle == "yearly"
    if yearly and plan.get("yearly_price") is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yearly billing is not available for this plan")
    amount = float(plan.get("yearly_price") if yearly else plan.get("price", 0) or 0)
    duration_days = 365 if yearly else 30
    membership = {
        "_id": uuid4().hex,
        "user_id": user["_id"],
        "plan_id": plan["_id"],
        "cycle": body.cycle,
        "discount_percent": int(plan.get("discount_percent") or 0),
        "status": "active" if body.method == "admin" and user.get("role") == "admin" else "pending_verification",
        "payment_id": None,
        "duration_days": duration_days,
        "started_at": None,
        "expires_at": None,
        "created_at": _now(),
    }
    await db.memberships.insert_one(membership)
    payment = await _create_payment(
        db,
        user_id=user["_id"],
        amount=amount,
        currency=plan.get("currency") or "USD",
        purpose="membership",
        target_id=membership["_id"],
        provider=body.method if body.method != "admin" else "manual",
        status_="awaiting_verification" if body.method == "manual" else "pending",
    )
    await db.memberships.update_one({"_id": membership["_id"]}, {"$set": {"payment_id": payment["_id"]}})
    membership["payment_id"] = payment["_id"]
    if membership["status"] == "active":
        await _activate_target(db, payment)
        membership["started_at"] = _now()
        membership["expires_at"] = _now() + timedelta(days=membership["duration_days"])
    await emit("admin", "membership.created", {"membership_id": membership["_id"], "user_id": user["_id"], "plan": plan.get("name"), "amount": amount})
    await emit("user:{user_id}".format(user_id=user["_id"]), "membership.updated", {"membership_id": membership["_id"], "status": membership["status"]})
    return serialize(membership)


@router.get("/memberships/mine")
async def my_memberships(user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.memberships.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(length=50)
    out = serialize_many(docs)
    for m in out:
        plan = await db.membership_plans.find_one({"_id": m["plan_id"]})
        m["plan"] = serialize(plan) if plan else None
        if m.get("payment_id"):
            pay = await db.payments.find_one({"_id": m["payment_id"]})
            m["payment"] = serialize(pay) if pay else None
        if m.get("status") == "active" and m.get("expires_at") and m["expires_at"] < _now():
            m["status"] = "expired"
    return out


# ---------------- Payments ----------------

@router.get("/payments/mine")
async def my_payments(user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.payments.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(length=100)
    return serialize_many(docs)


@router.get("/payments", response_model=Page[dict])
async def admin_list_payments(
    _: dict = Depends(require_admin),
    status_: str | None = None,
    provider: str | None = None,
    page: int = 1,
    size: int = 20,
):
    db = get_db()
    query: dict = {}
    if status_:
        query["status"] = status_
    if provider:
        query["provider"] = provider
    total = await db.payments.count_documents(query)
    cursor = db.payments.find(query).sort("created_at", -1).skip((page - 1) * size).limit(size)
    items = serialize_many(await cursor.to_list(length=size))
    for p in items:
        u = await db.users.find_one({"_id": p["user_id"]})
        p["user"] = {"id": u["_id"], "name": u["name"], "email": u["email"]} if u else None
    return Page[dict](items=items, total=total, page=page, size=size)


@router.post("/payments/{payment_id}/proof")
async def upload_proof(payment_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    db = get_db()
    payment = await db.payments.find_one({"_id": payment_id, "user_id": user["_id"]})
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Proof too large")
    url = await upload_bytes(data, f"payments/{payment_id}", file.content_type)
    if not url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "File storage not configured")
    await db.payments.update_one(
        {"_id": payment_id},
        {"$set": {"proof_url": url, "updated_at": _now()}},
    )
    payment["proof_url"] = url
    return serialize(payment)


@router.post("/payments/{payment_id}/verify", response_model=dict)
async def verify_payment(payment_id: str, body: PaymentVerifyManual, admin: dict = Depends(require_admin)):
    db = get_db()
    payment = await db.payments.find_one({"_id": payment_id})
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    update = {
        "status": body.status,
        "notes": body.notes,
        "verified_by": admin["_id"],
        "verified_at": _now(),
        "updated_at": _now(),
    }
    await db.payments.update_one({"_id": payment_id}, {"$set": update})
    payment.update(update)
    await emit("admin", "payment.updated", {"payment_id": payment_id, "status": body.status, "purpose": payment.get("purpose")})
    await emit("user:{user_id}".format(user_id=payment["user_id"]), "payment.updated", {"payment_id": payment_id, "status": body.status, "purpose": payment.get("purpose")})
    if body.status == "succeeded":
        await _activate_target(db, payment)
    elif body.status in ("failed", "refunded") and payment.get("purpose") == "enrolment":
        await db.enrolments.update_one({"_id": payment["target_id"]}, {"$set": {"status": "cancelled"}})
    return serialize(payment)


@router.post("/payments/paypal/create-order")
async def paypal_create_order(body: PayPalCreateIn, user: dict = Depends(get_current_user)):
    if not paypal_service.is_configured():
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "PayPal is not configured")
    db = get_db()
    target = None
    if body.purpose == "enrolment":
        target = await db.enrolments.find_one({"_id": body.target_id, "user_id": user["_id"]})
        if not target:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrolment not found")
        amount, currency, description = await _enrolment_amount(db, target)
    else:
        target = await db.memberships.find_one({"_id": body.target_id, "user_id": user["_id"]})
        if not target:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Membership not found")
        plan = await db.membership_plans.find_one({"_id": target["plan_id"]})
        if target.get("cycle") == "yearly" and plan and plan.get("yearly_price") is not None:
            amount = float(plan.get("yearly_price") or 0)
        else:
            amount = plan.get("price", 0) if plan else 0
        currency = (plan.get("currency") or "USD") if plan else "USD"
        description = f"Membership: {plan.get('name', '') if plan else ''}"

    order = await paypal_service.create_order(amount, currency, description)
    provider_ref = order.get("id")
    payment = await db.payments.find_one({"_id": target.get("payment_id")})
    if payment:
        await db.payments.update_one(
            {"_id": payment["_id"]},
            {"$set": {"provider": "paypal", "provider_ref": provider_ref, "status": "pending", "amount": amount, "currency": currency, "updated_at": _now()}},
        )
    else:
        payment = await _create_payment(
            db, user_id=user["_id"], amount=amount, currency=currency,
            purpose=body.purpose, target_id=target["_id"], provider="paypal", status_="pending",
        )
        payment["provider_ref"] = provider_ref
        await db.payments.update_one({"_id": payment["_id"]}, {"$set": {"provider_ref": provider_ref}})
        await db[{"enrolment": "enrolments", "membership": "memberships"}[body.purpose]].update_one(
            {"_id": target["_id"]}, {"$set": {"payment_id": payment["_id"]}}
        )
    approve = next((l.get("href") for l in order.get("links", []) if l.get("rel") == "approve"), None)
    return {"order_id": provider_ref, "approve_url": approve, "status": order.get("status")}


@router.post("/payments/paypal/capture")
async def paypal_capture(body: PayPalCaptureIn, user: dict = Depends(get_current_user)):
    if not paypal_service.is_configured():
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "PayPal is not configured")
    db = get_db()
    result = await paypal_service.capture_order(body.order_id)
    if result.get("status") != "COMPLETED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "PayPal capture not completed")
    payment = await db.payments.find_one({"provider_ref": body.order_id, "user_id": user["_id"]})
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    await db.payments.update_one(
        {"_id": payment["_id"]},
        {"$set": {"status": "succeeded", "verified_at": _now(), "updated_at": _now()}},
    )
    payment["status"] = "succeeded"
    await emit("admin", "payment.updated", {"payment_id": payment["_id"], "status": "succeeded", "purpose": payment.get("purpose")})
    await emit("user:{user_id}".format(user_id=payment["user_id"]), "payment.updated", {"payment_id": payment["_id"], "status": "succeeded", "purpose": payment.get("purpose")})
    await _activate_target(db, payment)
    return serialize(payment)


@router.post("/payments/paypal/webhook")
async def paypal_webhook(request: Request):
    raw = await request.body()
    headers = {k.lower(): v for k, v in request.headers.items()}
    try:
        ok = await paypal_service.verify_webhook(headers, raw)
    except Exception:
        ok = False
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid webhook signature")
    event = json.loads(raw)
    event_type = event.get("event_type", "")
    db = get_db()
    if event_type in ("PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.APPROVED"):
        resource = event.get("resource", {})
        order_id = resource.get("order_id") or resource.get("supplementary_data") or None
        if event_type == "PAYMENT.CAPTURE.COMPLETED":
            order_id = (resource.get("supplementary_data") or {}).get("related_ids", {}).get("order_id")
        if order_id:
            payment = await db.payments.find_one({"provider_ref": order_id})
            if payment and payment["status"] != "succeeded":
                await db.payments.update_one(
                    {"_id": payment["_id"]},
                    {"$set": {"status": "succeeded", "verified_at": _now(), "updated_at": _now()}},
                )
                payment["status"] = "succeeded"
                await _activate_target(db, payment)
    return {"received": True}


# ---------------- Promotions ----------------


@router.get("/promos")
async def list_promos(_: dict = Depends(require_admin)):
    db = get_db()
    docs = await db.promos.find({}).sort("created_at", -1).to_list(length=500)
    return serialize_many(docs)


@router.post("/promos", response_model=dict)
async def create_promo(body: PromoIn, admin: dict = Depends(require_admin)):
    db = get_db()
    existing = await db.promos.find_one({"code": {"$regex": f"^{body.code}$", "$options": "i"}})
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This promo code already exists")
    if body.scope == "programme":
        if not body.programme_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose a course for a course-specific promo")
        if not await db.programmes.find_one({"_id": body.programme_id}):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Course not found")
    doc = body.model_dump()
    doc["_id"] = uuid4().hex
    doc["code"] = doc["code"].strip().upper()
    doc["used_count"] = 0
    doc["created_by"] = admin["_id"]
    doc["created_at"] = _now()
    await db.promos.insert_one(doc)
    await emit("public", "promos.changed", {})
    await emit("admin", "promos.changed", {"code": doc["code"]})
    return serialize(doc)


@router.put("/promos/{promo_id}", response_model=dict)
async def update_promo(promo_id: str, body: PromoIn, _: dict = Depends(require_admin)):
    db = get_db()
    doc = await db.promos.find_one({"_id": promo_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Promo code not found")
    if body.scope == "programme" and not body.programme_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose a course for a course-specific promo")
    data = body.model_dump()
    data["code"] = data["code"].strip().upper()
    dupe = await db.promos.find_one({"code": data["code"], "_id": {"$ne": promo_id}})
    if dupe:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This promo code already exists")
    await db.promos.update_one({"_id": promo_id}, {"$set": data})
    doc.update(data)
    await emit("public", "promos.changed", {})
    await emit("admin", "promos.changed", {"code": doc["code"]})
    return serialize(doc)


@router.delete("/promos/{promo_id}", response_model=MessageOut)
async def delete_promo(promo_id: str, _: dict = Depends(require_admin)):
    db = get_db()
    await db.promos.delete_one({"_id": promo_id})
    await emit("public", "promos.changed", {})
    await emit("admin", "promos.changed", {})
    return MessageOut(message="Promo code deleted")


# ---------------- Pricing preview ----------------


@router.post("/pricing/preview", response_model=dict)
async def pricing_preview(body: PricingPreviewIn, user: dict | None = Depends(get_optional_user)):
    """Server-side quote: base price − membership discount − promo code (stacked)."""
    db = get_db()
    programme = await db.programmes.find_one({"_id": body.programme_id})
    if not programme:
        programme = await db.programmes.find_one({"slug": body.programme_id})
    if not programme:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not found")
    scope_doc = await _scope_doc(db, programme, body.scope_type, body.scope_id)
    price = _scope_price(programme, body.scope_type, scope_doc)
    quote = await quote_price(db, base=price, user=user, programme=programme, promo_code=body.promo_code)
    pricing_mode = programme.get("pricing_mode") or "once"
    interval = programme.get("billing_interval") or "monthly"
    bundle_error = None
    if body.scope_type == "programme" and pricing_mode in ("per_lesson", "per_module") and not programme.get("is_free") and price <= 0:
        bundle_error = "This programme is sold by module/lesson — set a full-programme price or mark it free"
    return {
        **quote,
        "bundle_error": bundle_error,
        "pricing_mode": pricing_mode,
        "billing_interval": interval if pricing_mode == "subscription" else None,
        "interval_days": interval_days(interval) if pricing_mode == "subscription" else None,
        "programme_is_free": bool(programme.get("is_free")),
        "scope_type": body.scope_type,
        "scope_id": body.scope_id,
    }
