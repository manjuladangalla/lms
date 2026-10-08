from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user, require_counselor
from app.events import emit
from app.models.common import MessageOut, serialize, serialize_many
from app.models.counselling import (
    CounsellingBookingIn,
    CounsellingBookingPatch,
    CounsellingScheduleIn,
    CounsellingSchedulePatch,
)
from app.services import zoom

router = APIRouter(prefix="/counselling", tags=["counselling"])

PUBLIC = "public"
STAFF = "staff"

EMPTY = {"schedule_id": {"$in": []}}  # matches nothing - used for empty scopes


# --------------------------------------------------------------- helpers ----

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _key(value: datetime | None) -> str:
    """Stable map key for a slot start (always UTC ISO)."""
    return _aware(value).astimezone(timezone.utc).isoformat()


def _to_minutes(value: str) -> int:
    hour, minute = str(value or "0:0").split(":")[:2]
    return int(hour) * 60 + int(minute)


def _offsets(schedule: dict) -> list[int]:
    """Slot start offsets (minutes from midnight) for a weekly rule."""
    step = int(schedule.get("slot_minutes") or 30)
    start = _to_minutes(schedule.get("start_time"))
    end = _to_minutes(schedule.get("end_time"))
    return list(range(start, end - step + 1, step))


def _days(schedule: dict) -> set[int]:
    """Days of the week (0 = Monday) this weekly rule runs on - legacy rows have a single `weekday`."""
    days = schedule.get("weekdays")
    if days:
        return set(days)
    if schedule.get("weekday") is not None:
        return {int(schedule.get("weekday"))}
    return set()


def _day_slots(schedule: dict, day: date) -> list[datetime]:
    if day.weekday() not in _days(schedule):
        return []
    day0 = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    return [day0 + timedelta(minutes=offset) for offset in _offsets(schedule)]


def _parse_date(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "date must be YYYY-MM-DD")


def _scan(schedules: list[dict], now: datetime, days: int) -> list[tuple[datetime, dict]]:
    """Every future slot of the given weekly rules inside the next `days` days, sorted by time."""
    out: list[tuple[datetime, dict]] = []
    horizon = now + timedelta(days=days)
    day = now.date()
    while datetime(day.year, day.month, day.day, tzinfo=timezone.utc) <= horizon:
        for schedule in schedules:
            for start in _day_slots(schedule, day):
                if now < start <= horizon:
                    out.append((start, schedule))
        day += timedelta(days=1)
    out.sort(key=lambda item: item[0])
    return out


async def _availability(db, schedules: list[dict], window_start: datetime, window_end: datetime) -> dict:
    """Taken seats per (schedule_id, slot_start) inside the window - cancelled bookings do not count."""
    ids = [s["_id"] for s in schedules]
    if not ids:
        return {}
    cursor = db.counselling_bookings.find(
        {
            "schedule_id": {"$in": ids},
            "slot_start": {"$gte": window_start, "$lt": window_end},
            "status": {"$ne": "cancelled"},
        }
    )
    counts: dict[tuple[str, str], int] = {}
    for booking in await cursor.to_list(length=5000):
        key = (booking.get("schedule_id"), _key(booking.get("slot_start")))
        counts[key] = counts.get(key, 0) + 1
    return counts


def _seats_left(schedule: dict, start: datetime, counts: dict) -> int:
    capacity = int(schedule.get("capacity") or 1)
    used = counts.get((schedule["_id"], _key(start)), 0)
    return max(0, capacity - used)


def _slot_payload(schedule: dict, start: datetime, counts: dict) -> dict:
    step = int(schedule.get("slot_minutes") or 30)
    seats_left = _seats_left(schedule, start, counts)
    return {
        "schedule_id": schedule["_id"],
        "counsellor_id": schedule.get("counsellor_id"),
        "title": schedule.get("title"),
        "description": schedule.get("description"),
        "weekday": start.weekday(),
        "start": start.isoformat(),
        "end": (start + timedelta(minutes=step)).isoformat(),
        "duration_min": step,
        "mode": schedule.get("mode") or "both",
        "price": float(schedule.get("price") or 0),
        "currency": schedule.get("currency") or "USD",
        "location": schedule.get("location"),
        "capacity": int(schedule.get("capacity") or 1),
        "seats_left": seats_left,
        "available": seats_left > 0,
    }


def _weekly_summary(schedules: list[dict]) -> list[dict]:
    entries = [
        {
            "weekday": day,
            "start_time": s.get("start_time"),
            "end_time": s.get("end_time"),
            "slot_minutes": int(s.get("slot_minutes") or 30),
        }
        for s in schedules
        if s.get("status") == "active"
        for day in sorted(_days(s))
    ]
    return sorted(entries, key=lambda item: (item["weekday"], item["start_time"] or ""))


def _ensure_owner(schedule: dict, user: dict) -> None:
    if user.get("role") == "admin":
        return
    if schedule.get("counsellor_id") != user.get("_id"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not own this session")


def _scope(user: dict) -> dict:
    return {} if user.get("role") == "admin" else {"counsellor_id": user["_id"]}


def _overlaps(schedule: dict, other: dict) -> bool:
    if not (_days(schedule) & _days(other)):
        return False
    a0, a1 = _to_minutes(schedule.get("start_time")), _to_minutes(schedule.get("end_time"))
    b0, b1 = _to_minutes(other.get("start_time")), _to_minutes(other.get("end_time"))
    return max(a0, b0) < min(a1, b1)


async def _create_zoom(schedule: dict, slot: datetime, duration_min: int, client_name: str):
    """One Zoom meeting per booking - returns (join_url, meeting_id, password, note)."""
    if not await zoom.is_configured():
        return None, None, None, "Zoom is not configured yet - the institute will email you the online link."
    try:
        meeting = await zoom.create_meeting(
            topic=f"Counselling: {schedule.get('title') or 'Session'}",
            start_time_iso=_key(slot).replace("+00:00", "Z"),
            duration_min=duration_min,
            agenda=f"Confidential counselling appointment for {client_name}"[:500],
        )
    except Exception as exc:  # noqa: BLE001 - booking must not fail because Zoom is down
        print(f"[counselling] zoom meeting creation failed: {exc}")
        return None, None, None, "The online meeting could not be created automatically - the link will be emailed to you."
    return meeting.get("join_url"), str(meeting.get("id") or ""), meeting.get("password"), None


async def _drop_zoom(booking: dict) -> None:
    if booking.get("zoom_meeting_id"):
        try:
            await zoom.delete_meeting(booking["zoom_meeting_id"])
        except Exception:  # noqa: BLE001 - cleanup is best effort
            pass


async def _enrich_bookings(db, bookings: list[dict], with_counsellor: bool = True) -> list[dict]:
    items = serialize_many(bookings)
    if not items or not with_counsellor:
        return items
    counsellor_ids = list({b.get("counsellor_id") for b in items if b.get("counsellor_id")})
    users = await db.users.find({"_id": {"$in": counsellor_ids}}).to_list(length=200) if counsellor_ids else []
    names = {u["_id"]: u.get("name") for u in users}
    for item in items:
        item["counsellor_name"] = names.get(item.get("counsellor_id")) or "Counsellor"
    return items


# ---------------------------------------------------------------- public ----

@router.get("/counsellors")
async def list_counsellors():
    """Active counsellors with their weekly pattern and next free slot - public, no login."""
    db = get_db()
    now = _now()
    users = await db.users.find({"role": "counselor", "status": "active"}).to_list(length=200)
    if not users:
        return []
    ids = [u["_id"] for u in users]
    schedules = await db.counselling_schedules.find(
        {"counsellor_id": {"$in": ids}, "status": "active"}
    ).to_list(length=500)
    horizon = now + timedelta(days=21)
    counts = await _availability(db, schedules, now, horizon)

    out = []
    for u in users:
        mine = [s for s in schedules if s.get("counsellor_id") == u["_id"]]
        free = [(start, sc) for start, sc in _scan(mine, now, 21) if _seats_left(sc, start, counts) > 0]
        out.append(
            {
                "id": u["_id"],
                "name": u.get("name"),
                "specialty": u.get("specialty"),
                "bio": u.get("bio"),
                "avatar_url": u.get("avatar_url"),
                "weekly": _weekly_summary(mine),
                "upcoming_slots": len(free),
                "next_available": free[0][0].isoformat() if free else None,
            }
        )
    out.sort(key=lambda c: (-c["upcoming_slots"], (c["name"] or "").lower()))
    return out


@router.get("/dates")
async def list_dates(counsellor_id: str = Query(min_length=1)):
    """Every date in the next 60 days that has sessions - `free` seats still open, `total` slots that day.

    Fully booked days come back with free = 0 so the date picker can show them as unavailable.
    """
    db = get_db()
    now = _now()
    schedules = await db.counselling_schedules.find(
        {"counsellor_id": counsellor_id, "status": "active"}
    ).to_list(length=200)
    if not schedules:
        return []
    horizon = now + timedelta(days=60)
    counts = await _availability(db, schedules, now, horizon)
    buckets: dict[str, dict] = {}
    for start, schedule in _scan(schedules, now, 60):
        key = start.date().isoformat()
        bucket = buckets.setdefault(key, {"total": 0, "free": 0})
        bucket["total"] += 1
        if _seats_left(schedule, start, counts) > 0:
            bucket["free"] += 1
    return [
        {"date": day, "free": bucket["free"], "total": bucket["total"]}
        for day, bucket in sorted(buckets.items())
    ]


@router.get("/slots")
async def list_slots(counsellor_id: str = Query(min_length=1), date: str = Query(...)):
    """All slots of one day for a counsellor - booked ones are flagged `available: false`."""
    db = get_db()
    now = _now()
    day = _parse_date(date)
    day0 = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    day1 = day0 + timedelta(days=1)
    schedules = [
        s
        for s in await db.counselling_schedules.find(
            {"counsellor_id": counsellor_id, "status": "active"}
        ).to_list(length=50)
        if day.weekday() in _days(s)
    ]
    counts = await _availability(db, schedules, day0, day1)
    slots = []
    for schedule in schedules:
        for start in _day_slots(schedule, day):
            if start <= now:
                continue
            slots.append(_slot_payload(schedule, start, counts))
    slots.sort(key=lambda slot: slot["start"])
    return {"date": date, "weekday": day.weekday(), "slots": slots}


@router.get("/upcoming-slots")
async def upcoming_slots(limit: int = Query(12, ge=1, le=48)):
    """Next free slots across every counsellor - powers the browse grid."""
    db = get_db()
    now = _now()
    users = await db.users.find({"role": "counselor", "status": "active"}).to_list(length=200)
    ids = [u["_id"] for u in users]
    by_id = {u["_id"]: u for u in users}
    schedules = await db.counselling_schedules.find(
        {"counsellor_id": {"$in": ids}, "status": "active"}
    ).to_list(length=500) if ids else []
    horizon = now + timedelta(days=21)
    counts = await _availability(db, schedules, now, horizon)
    out = []
    for start, schedule in _scan(schedules, now, 21):
        if _seats_left(schedule, start, counts) <= 0:
            continue
        payload = _slot_payload(schedule, start, counts)
        counsellor = by_id.get(schedule.get("counsellor_id")) or {}
        payload["counsellor_name"] = counsellor.get("name")
        payload["specialty"] = counsellor.get("specialty")
        out.append(payload)
        if len(out) >= limit:
            break
    return out


@router.post("/book")
async def book_slot(body: CounsellingBookingIn, user: dict | None = Depends(get_optional_user)):
    """Book one slot of a counsellor's weekly schedule - guests (no token) and signed-in users.

    A slot with no seats left returns 409, so it is gone for everybody else.
    """
    db = get_db()
    now = _now()
    schedule = await db.counselling_schedules.find_one({"_id": body.schedule_id})
    if not schedule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That session is no longer available")
    if schedule.get("status") != "active":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This session is not open for booking")

    slot = _aware(body.slot_start) or now
    day = slot.astimezone(timezone.utc).date()
    if day.weekday() not in _days(schedule):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That day is not part of this session's schedule")
    if int((slot - datetime(day.year, day.month, day.day, tzinfo=timezone.utc)).total_seconds() // 60) not in _offsets(schedule):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That time is not one of this session's slots")
    if slot <= now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That time slot has already passed")

    offered = schedule.get("mode") or "both"
    if offered == "both":
        if body.mode not in ("online", "in_person"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please choose online or in person")
        mode = body.mode
    else:
        mode = offered
        if body.mode and body.mode != mode:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"This session is {mode.replace('_', ' ')} only",
            )

    email = body.email.lower()
    match = {"schedule_id": schedule["_id"], "slot_start": slot, "status": {"$ne": "cancelled"}}
    duplicate = await db.counselling_bookings.find_one({**match, "email": email})
    if duplicate:
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already booked this time slot")

    taken = await db.counselling_bookings.count_documents(match)
    if taken >= int(schedule.get("capacity") or 1):
        raise HTTPException(status.HTTP_409_CONFLICT, "That time slot has just been booked - please pick another")

    step = int(schedule.get("slot_minutes") or 30)
    join_url = meeting_id = password = note = venue = None
    if mode == "online":
        join_url, meeting_id, password, note = await _create_zoom(schedule, slot, step, body.name)
    else:
        venue = schedule.get("location")

    booking = {
        "_id": uuid4().hex,
        "schedule_id": schedule["_id"],
        "counsellor_id": schedule.get("counsellor_id"),
        "slot_start": slot,
        "slot_end": slot + timedelta(minutes=step),
        "duration_min": step,
        "title": schedule.get("title"),
        "price": float(schedule.get("price") or 0),
        "currency": schedule.get("currency") or "USD",
        "location": schedule.get("location"),
        "user_id": (user or {}).get("_id"),
        "name": body.name,
        "email": email,
        "phone": body.phone,
        "note": body.note,
        "mode": mode,
        "join_url": join_url,
        "zoom_meeting_id": meeting_id,
        "meeting_password": password,
        "meeting_note": note,
        "venue": venue,
        "status": "booked",
        "created_at": now,
    }
    await db.counselling_bookings.insert_one(booking)

    seats_left = max(0, int(schedule.get("capacity") or 1) - (taken + 1))
    for channel in (PUBLIC, STAFF):
        await emit(
            channel,
            "counselling.booked",
            {
                "schedule_id": schedule["_id"],
                "slot_start": slot.isoformat(),
                "date": day.isoformat(),
                "seats_left": seats_left,
            },
        )
        await emit(channel, "counselling.changed", {"schedule_id": schedule["_id"], "action": "booked"})

    counsellor = await db.users.find_one({"_id": schedule.get("counsellor_id")})
    saved = dict(booking)
    saved["id"] = saved.pop("_id")
    saved["slot_start"] = slot.isoformat()
    saved["slot_end"] = (slot + timedelta(minutes=step)).isoformat()
    saved["counsellor_name"] = (counsellor or {}).get("name") or "Counsellor"
    return saved


@router.get("/my-bookings")
async def my_bookings(user: dict = Depends(get_current_user)):
    """Bookings made by the signed-in user (guests have no token, so none here)."""
    db = get_db()
    now = _now()
    bookings = await db.counselling_bookings.find({"user_id": user["_id"]}).sort("slot_start", -1).to_list(length=200)
    items = await _enrich_bookings(db, bookings)
    for item in items:
        item["is_past"] = (_aware(item.get("slot_start")) or now) <= now
    return items


# ------------------------------------------------------ counsellor / admin ---

@router.get("/my-schedules")
async def my_schedules(user: dict = Depends(require_counselor)):
    """Weekly rules in scope (admin sees everyone) with booked / free counts."""
    db = get_db()
    now = _now()
    raw = await db.counselling_schedules.find(_scope(user)).sort([("title", 1), ("start_time", 1)]).to_list(length=300)
    booked_counts = await _availability(db, raw, now, now + timedelta(days=30))
    horizon = now + timedelta(days=14)
    open_counts = await _availability(db, raw, now, horizon)

    items = []
    for schedule in raw:
        item = serialize(schedule)
        item["counsellor_name"] = schedule.get("counsellor_name")
        item["upcoming_bookings"] = sum(
            count for key, count in booked_counts.items() if key[0] == schedule["_id"]
        )
        free = [(start, sc) for start, sc in _scan([schedule], now, 14) if _seats_left(sc, start, open_counts) > 0]
        item["free_next_14d"] = len(free)
        item["next_free"] = free[0][0].isoformat() if free else None
        items.append(item)
    return items


@router.post("/schedules")
async def create_schedule(body: CounsellingScheduleIn, user: dict = Depends(require_counselor)):
    db = get_db()
    doc = body.model_dump()
    doc["_id"] = uuid4().hex
    doc["counsellor_id"] = user["_id"]
    doc["counsellor_name"] = user.get("name")
    doc["created_at"] = _now()
    doc["updated_at"] = _now()

    existing = await db.counselling_schedules.find(
        {"counsellor_id": user["_id"], "status": "active", "_id": {"$ne": doc["_id"]}}
    ).to_list(length=100)
    if any(_overlaps(doc, other) for other in existing):
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have an overlapping session on that day")

    await db.counselling_schedules.insert_one(doc)
    for channel in (STAFF, PUBLIC):
        await emit(channel, "counselling.changed", {"schedule_id": doc["_id"], "action": "created"})
    return (await _my_schedule_out(db, doc))[0]


@router.patch("/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, body: CounsellingSchedulePatch, user: dict = Depends(require_counselor)):
    db = get_db()
    doc = await db.counselling_schedules.find_one({"_id": schedule_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _ensure_owner(doc, user)

    changes = body.model_dump(exclude_unset=True)
    merged = {**doc, **changes}
    start, end = _to_minutes(merged.get("start_time")), _to_minutes(merged.get("end_time"))
    step = int(merged.get("slot_minutes") or 30)
    if end <= start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "end_time must be after start_time")
    if end - start < step:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "the range must fit at least one full slot")

    if {"weekdays", "start_time", "end_time", "slot_minutes"} & set(changes):
        others = await db.counselling_schedules.find(
            {"counsellor_id": doc.get("counsellor_id"), "status": "active", "_id": {"$ne": schedule_id}}
        ).to_list(length=100)
        if any(_overlaps(merged, other) for other in others):
            raise HTTPException(status.HTTP_409_CONFLICT, "You already have an overlapping session on that day")

    if changes:
        changes["updated_at"] = _now()
        await db.counselling_schedules.update_one({"_id": schedule_id}, {"$set": changes})
        for channel in (STAFF, PUBLIC):
            await emit(channel, "counselling.changed", {"schedule_id": schedule_id, "action": "updated"})
    doc = await db.counselling_schedules.find_one({"_id": schedule_id})
    return (await _my_schedule_out(db, doc))[0]


async def _my_schedule_out(db, doc: dict) -> list[dict]:
    now = _now()
    item = serialize(doc)
    counts = await _availability(db, [doc], now, now + timedelta(days=30))
    item["upcoming_bookings"] = sum(count for key, count in counts.items() if key[0] == doc["_id"])
    free = [(start, sc) for start, sc in _scan([doc], now, 14) if _seats_left(sc, start, counts) > 0]
    item["free_next_14d"] = len(free)
    item["next_free"] = free[0][0].isoformat() if free else None
    return [item]


@router.delete("/schedules/{schedule_id}", response_model=MessageOut)
async def delete_schedule(schedule_id: str, user: dict = Depends(require_counselor)):
    db = get_db()
    doc = await db.counselling_schedules.find_one({"_id": schedule_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _ensure_owner(doc, user)

    bookings = await db.counselling_bookings.find({"schedule_id": schedule_id}).to_list(length=500)
    for booking in bookings:
        await _drop_zoom(booking)
    await db.counselling_schedules.delete_one({"_id": schedule_id})
    await db.counselling_bookings.delete_many({"schedule_id": schedule_id})
    for channel in (STAFF, PUBLIC):
        await emit(channel, "counselling.changed", {"schedule_id": schedule_id, "action": "deleted"})
    return {"message": "Session deleted"}


@router.get("/bookings")
async def list_bookings(
    schedule_id: str | None = None,
    limit: int = Query(200, ge=1, le=500),
    user: dict = Depends(require_counselor),
):
    """Bookings in scope (admin: all, counsellor: own), soonest first."""
    db = get_db()
    query: dict
    if schedule_id:
        schedule = await db.counselling_schedules.find_one({"_id": schedule_id})
        if not schedule:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
        _ensure_owner(schedule, user)
        query = {"schedule_id": schedule_id}
    elif user.get("role") == "admin":
        query = {}
    else:
        mine = await db.counselling_schedules.find({"counsellor_id": user["_id"]}).to_list(length=300)
        query = {"schedule_id": {"$in": [m["_id"] for m in mine]}} if mine else EMPTY
    raw = await db.counselling_bookings.find(query).sort("slot_start", -1).limit(limit).to_list(length=limit)
    now = _now()
    upcoming = sorted(
        [b for b in raw if (_aware(b.get("slot_start")) or now) > now],
        key=lambda b: _aware(b.get("slot_start")) or now,
    )
    past = sorted(
        [b for b in raw if (_aware(b.get("slot_start")) or now) <= now],
        key=lambda b: _aware(b.get("slot_start")) or now,
        reverse=True,
    )
    return await _enrich_bookings(db, upcoming + past)


@router.patch("/bookings/{booking_id}")
async def update_booking(booking_id: str, body: CounsellingBookingPatch, user: dict = Depends(get_current_user)):
    db = get_db()
    booking = await db.counselling_bookings.find_one({"_id": booking_id})
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    is_owner = user.get("role") == "admin" or booking.get("counsellor_id") == user.get("_id")
    is_client = booking.get("user_id") == user.get("_id")
    if not is_owner:
        if not (is_client and body.status == "cancelled"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to change this booking")

    if body.status == "cancelled" and booking.get("status") != "cancelled":
        await _drop_zoom(booking)

    await db.counselling_bookings.update_one(
        {"_id": booking_id}, {"$set": {"status": body.status, "updated_at": _now()}}
    )
    for channel in (STAFF, PUBLIC):
        await emit(
            channel,
            "counselling.changed",
            {"schedule_id": booking.get("schedule_id"), "slot_start": _key(booking.get("slot_start")), "action": "booking"},
        )
    updated = await db.counselling_bookings.find_one({"_id": booking_id})
    return (await _enrich_bookings(db, [updated]))[0]


@router.get("/stats")
async def counselling_stats(user: dict = Depends(require_counselor)):
    """Counsellor (and admin) dashboard numbers + next appointments."""
    db = get_db()
    now = _now()
    schedules = await db.counselling_schedules.find(_scope(user)).to_list(length=1000)
    ids = [s["_id"] for s in schedules]
    bookings = await db.counselling_bookings.find(
        {"schedule_id": {"$in": ids}} if ids else EMPTY
    ).to_list(length=3000)

    active = [b for b in bookings if b.get("status") != "cancelled"]
    upcoming = sorted(
        [b for b in active if (_aware(b.get("slot_start")) or now) > now],
        key=lambda b: _aware(b.get("slot_start")) or now,
    )
    recent = sorted(bookings, key=lambda b: b.get("created_at") or now, reverse=True)

    horizon = now + timedelta(days=14)
    live = [s for s in schedules if s.get("status") == "active"]
    taken = await _availability(db, live, now, horizon)
    open_slots = sum(1 for start, sc in _scan(live, now, 14) if _seats_left(sc, start, taken) > 0)

    return {
        "stats": {
            "active_schedules": len(live),
            "open_slots": open_slots,
            "upcoming_bookings": len(upcoming),
            "total_bookings": len(active),
            "attended": len([b for b in bookings if b.get("status") == "attended"]),
            "cancelled": len([b for b in bookings if b.get("status") == "cancelled"]),
            "online_bookings": len([b for b in active if b.get("mode") == "online"]),
        },
        "next_bookings": await _enrich_bookings(db, upcoming[:6]),
        "recent_bookings": await _enrich_bookings(db, recent[:8]),
    }
