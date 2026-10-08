from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_db
from app.core.deps import get_current_user, require_staff
from app.events import emit
from app.models.common import MessageOut, serialize, serialize_many
from app.models.live import LiveSessionIn
from app.routers.content import _is_owner
from app.services import zoom
from app.services.progress import active_enrolment, active_enrolments, can_access_lesson

router = APIRouter(tags=["live"])

MAX_OCCURRENCES = 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _add_months(dt: datetime, months: int) -> datetime:
    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, [31, 29 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 28,
                       31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return dt.replace(year=year, month=month, day=day)


def _occurrence_starts(start: datetime | None, recurrence: str, until: datetime | None) -> list[datetime]:
    """Materialized occurrence times (first = start), capped at MAX_OCCURRENCES."""
    if not start:
        return [None]  # type: ignore[list-item]
    start = _aware(start)
    if recurrence == "none" or not until:
        return [start]
    until = _aware(until)
    if until <= start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "'Repeat until' must be after the start time")
    out = [start]
    cur = start
    while len(out) < MAX_OCCURRENCES:
        if recurrence == "daily":
            cur = cur + timedelta(days=1)
        elif recurrence == "weekly":
            cur = cur + timedelta(weeks=1)
        else:
            cur = _add_months(cur, 1)
        if cur > until:
            break
        out.append(cur)
    return out


def _to_zoom_time(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def _get_session(db, sid: str) -> dict:
    doc = await db.live_sessions.find_one({"_id": sid})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Live session not found")
    return doc


async def _can_access(db, user: dict, programme_id: str) -> bool:
    """Students need an active enrolment. Staff only for courses they own."""
    programme = await db.programmes.find_one({"_id": programme_id})
    if user.get("role") in ("admin", "lecturer"):
        return bool(programme) and _is_owner(user, programme)
    if await active_enrolment(db, user["_id"], programme_id):
        return True
    return False


def _public_view(doc: dict, can_see_link: bool) -> dict:
    out = serialize(doc) or {}
    if not can_see_link:
        out.pop("join_url", None)
        out.pop("zoom_meeting_id", None)
        out.pop("zoom_password", None)
    # Effective status: scheduled sessions past their end are shown as ended
    if out.get("status") == "scheduled":
        start = _aware(doc.get("start_time"))
        if start and start + timedelta(minutes=doc.get("duration_min") or 60) < _now():
            out["status"] = "ended"
    return out


@router.get("/programmes/{pid}/live-sessions", response_model=list[dict])
async def list_live_sessions(pid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    programme = await db.programmes.find_one({"_id": pid})
    if not programme:
        programme = await db.programmes.find_one({"slug": pid})
    if not programme:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not allowed")

    allowed = await _can_access(db, user, programme["_id"])
    if not allowed:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only enrolled students can view live classes for this programme",
        )

    cursor = db.live_sessions.find({"programme_id": programme["_id"]}).sort("start_time", 1)
    docs = await cursor.to_list(length=200)
    return [_public_view(d, allowed) for d in docs]


@router.post("/programmes/{pid}/live-sessions", response_model=dict)
async def create_live_session(pid: str, body: LiveSessionIn, user: dict = Depends(require_staff)):
    db = get_db()
    programme = await db.programmes.find_one({"_id": pid})
    if not programme:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not found")
    if not _is_owner(user, programme):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the admin or the lecturer who created this course can manage its live classes")
    if body.lesson_id:
        lesson = await db.lessons.find_one({"_id": body.lesson_id, "programme_id": programme["_id"]})
        if not lesson:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lesson does not belong to this programme")

    starts = _occurrence_starts(body.start_time, body.recurrence, body.recurrence_until)
    base = body.model_dump(exclude={"create_zoom", "manual_join_url", "passcode"})
    base.pop("start_time", None)
    base["programme_id"] = programme["_id"]
    base["created_at"] = _now()
    base["updated_at"] = _now()
    base["provider"] = body.provider
    base["join_url"] = None
    base["zoom_meeting_id"] = None
    base["zoom_password"] = None
    base["blocked_user_ids"] = []

    if body.provider == "manual":
        base["join_url"] = (body.manual_join_url or "").strip() or None
        base["zoom_password"] = body.passcode
    elif body.create_zoom and await zoom.is_configured():
        try:
            meeting = await zoom.create_meeting(
                topic=f"{body.title} — {programme.get('title', '')}",
                start_time_iso=_to_zoom_time(_aware(body.start_time)),
                duration_min=body.duration_min,
                agenda=body.description,
            )
            base["join_url"] = meeting.get("join_url")
            base["zoom_meeting_id"] = str(meeting.get("id") or "")
            base["zoom_password"] = meeting.get("password")
            base["provider"] = "zoom"
        except Exception as exc:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                f"Zoom meeting creation failed: {exc} | Fix in Admin -> System -> Zoom: "
                "the Server-to-Server OAuth app must be ACTIVE (not disabled) and have the scopes "
                "meeting:write:admin, meeting:read:admin, user:read:admin.",
            ) from exc
    else:
        base["provider"] = "manual"

    # One Zoom meeting / manual link shared by every occurrence of the series
    series_id = uuid4().hex
    docs = []
    for i, st in enumerate(starts):
        docs.append({
            **base,
            "_id": uuid4().hex,
            "start_time": st,
            "series_id": series_id,
            "occurrence_index": i,
        })
    await db.live_sessions.insert_many(docs)
    await emit("staff", "live.changed", {"programme_id": programme["_id"], "action": "created"})
    await emit("public", "live.changed", {"programme_id": programme["_id"], "action": "created"})
    return _public_view(docs[0], True)


@router.put("/live-sessions/{sid}", response_model=dict)
async def update_live_session(sid: str, body: LiveSessionIn, user: dict = Depends(require_staff)):
    """Edit affects FUTURE occurrences only; past occurrences stay as history."""
    db = get_db()
    doc = await _get_session(db, sid)
    programme = await db.programmes.find_one({"_id": doc["programme_id"]})
    if not programme or not _is_owner(user, programme):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the admin or the lecturer who created this course can manage its live classes")
    now = _now()
    if body.lesson_id:
        lesson = await db.lessons.find_one({"_id": body.lesson_id, "programme_id": doc["programme_id"]})
        if not lesson:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lesson does not belong to this programme")

    series_id = doc.get("series_id")
    series = await db.live_sessions.find({"series_id": series_id}).to_list(500) if series_id else [doc]
    future = [d for d in series if (_aware(d.get("start_time")) or now) > now]
    past_ids = [d["_id"] for d in series if d["_id"] not in {f["_id"] for f in future}]

    update = body.model_dump(exclude={"create_zoom", "manual_join_url", "passcode"})
    update["updated_at"] = _now()
    # Block list is managed via /participants — carry it over on series regeneration
    update["blocked_user_ids"] = doc.get("blocked_user_ids") or []
    if body.provider == "manual":
        update["join_url"] = (body.manual_join_url or "").strip() or doc.get("join_url")
        if body.passcode is not None:
            update["zoom_password"] = body.passcode
        update["zoom_meeting_id"] = None
        update["provider"] = "manual"
    else:
        # Reuse the existing meeting/link — no new Zoom meeting on series edits
        update["join_url"] = doc.get("join_url")
        update["zoom_meeting_id"] = doc.get("zoom_meeting_id")
        update["zoom_password"] = doc.get("zoom_password")
        update["provider"] = doc.get("provider") or "manual"
        if not update["join_url"] and body.create_zoom and await zoom.is_configured():
            programme = await db.programmes.find_one({"_id": doc["programme_id"]})
            try:
                meeting = await zoom.create_meeting(
                    topic=f"{body.title} — {(programme or {}).get('title', '')}",
                    start_time_iso=_to_zoom_time(body.start_time),
                    duration_min=body.duration_min,
                    agenda=body.description,
                )
                update["join_url"] = meeting.get("join_url")
                update["zoom_meeting_id"] = str(meeting.get("id") or "")
                update["zoom_password"] = meeting.get("password")
                update["provider"] = "zoom"
            except Exception as exc:
                raise HTTPException(
                    status.HTTP_502_BAD_GATEWAY,
                    f"Zoom meeting creation failed: {exc} | Fix in Admin -> System -> Zoom: "
                    "the Server-to-Server OAuth app must be ACTIVE (not disabled) and have the scopes "
                    "meeting:write:admin, meeting:read:admin, user:read:admin.",
                ) from exc

    starts = _occurrence_starts(body.start_time, body.recurrence, body.recurrence_until)

    if not future:
        # Single/one-off (or all occurrences already past): plain update of this doc
        await db.live_sessions.update_one({"_id": sid}, {"$set": update})
        await emit("staff", "live.changed", {"programme_id": doc["programme_id"], "action": "updated"})
        await emit("public", "live.changed", {"programme_id": doc["programme_id"], "action": "updated"})
        return _public_view(await _get_session(db, sid), True)

    # Remove old future occurrences, then regenerate from the new anchor
    await db.live_sessions.delete_many({"_id": {"$in": [d["_id"] for d in future]}})
    new_docs = []
    for i, st in enumerate(starts):
        new_docs.append({
            **update,
            "_id": uuid4().hex,
            "programme_id": doc["programme_id"],
            "series_id": series_id or doc["_id"],
            "occurrence_index": i,
            "start_time": st,
            "created_at": doc.get("created_at") or _now(),
        })
    if new_docs:
        await db.live_sessions.insert_many(new_docs)
    await emit("staff", "live.changed", {"programme_id": doc["programme_id"], "action": "updated"})
    await emit("public", "live.changed", {"programme_id": doc["programme_id"], "action": "updated"})
    out = new_docs[0] if new_docs else await _get_session(db, sid)
    return _public_view(out, True)


@router.delete("/live-sessions/{sid}", response_model=MessageOut)
async def delete_live_session(sid: str, user: dict = Depends(require_staff)):
    """Delete affects FUTURE occurrences only; past sessions stay as history."""
    db = get_db()
    doc = await _get_session(db, sid)
    programme = await db.programmes.find_one({"_id": doc["programme_id"]})
    if not programme or not _is_owner(user, programme):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the admin or the lecturer who created this course can manage its live classes")
    now = _now()
    series_id = doc.get("series_id")
    deleted = 0
    if series_id:
        series = await db.live_sessions.find({"series_id": series_id}).to_list(500)
        future_ids = [d["_id"] for d in series if (_aware(d.get("start_time")) or now) > now]
        if future_ids:
            result = await db.live_sessions.delete_many({"_id": {"$in": future_ids}})
            deleted = result.deleted_count
    if doc.get("zoom_meeting_id") and await zoom.is_configured() and deleted > 0:
        # Meeting is only removed when nothing upcoming remains for this series
        remaining = await db.live_sessions.count_documents(
            {"series_id": series_id, "start_time": {"$gt": now}}
        )
        if remaining == 0:
            try:
                await zoom.delete_meeting(doc["zoom_meeting_id"])
            except Exception:
                pass
    if deleted == 0:
        # Past single occurrence explicitly deleted (nothing upcoming to keep)
        await db.live_sessions.delete_one({"_id": sid})
        await emit("staff", "live.changed", {"programme_id": doc["programme_id"], "action": "deleted"})
        await emit("public", "live.changed", {"programme_id": doc["programme_id"], "action": "deleted"})
        return MessageOut(message="Live session deleted")
    await emit("staff", "live.changed", {"programme_id": doc["programme_id"], "action": "deleted"})
    await emit("public", "live.changed", {"programme_id": doc["programme_id"], "action": "deleted"})
    return MessageOut(message=f"Deleted {deleted} upcoming session(s); past sessions kept as history")


@router.post("/live-sessions/{sid}/join", response_model=dict)
async def join_live_session(sid: str, user: dict = Depends(get_current_user)):
    """Return join URL only for enrolled students (or staff)."""
    db = get_db()
    doc = await _get_session(db, sid)
    if doc.get("status") == "cancelled":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This live class was cancelled")
    if user["_id"] in (doc.get("blocked_user_ids") or []):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "The lecturer has blocked you from this class",
        )
    if not await _can_access(db, user, doc["programme_id"]):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only enrolled students can join this live class",
        )
    if doc.get("lesson_id"):
        lesson = await db.lessons.find_one({"_id": doc["lesson_id"]})
        if lesson and not await can_access_lesson(db, user, lesson):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "This live class belongs to a module or lesson you have not purchased",
            )
    if not doc.get("join_url"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Join link not available yet")
    return {
        "id": doc["_id"],
        "title": doc.get("title"),
        "join_url": doc["join_url"],
        "provider": doc.get("provider"),
        "start_time": doc.get("start_time"),
        "status": doc.get("status"),
    }


@router.get("/live-sessions/{sid}/participants", response_model=dict)
async def live_session_participants(sid: str, user: dict = Depends(require_staff)):
    """Participant list for the lecturer: enrolment/payment status + blocked flag."""
    db = get_db()
    doc = await _get_session(db, sid)
    programme = await db.programmes.find_one({"_id": doc["programme_id"]})
    if not programme or not _is_owner(user, programme):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the admin or the lecturer who created this course can view its class list")
    blocked = set(doc.get("blocked_user_ids") or [])
    enrols = await db.enrolments.find({"programme_id": doc["programme_id"]}).to_list(500)
    by_user: dict[str, list[dict]] = {}
    for e in enrols:
        by_user.setdefault(e["user_id"], []).append(e)

    lesson = None
    if doc.get("lesson_id"):
        lesson = await db.lessons.find_one({"_id": doc["lesson_id"]})

    participants = []
    for uid, rows in by_user.items():
        u = await db.users.find_one({"_id": uid})
        if not u:
            continue
        statuses = [r.get("status") for r in rows]
        if "active" in statuses:
            payment_status = "paid"
        elif "pending_verification" in statuses:
            payment_status = "awaiting_verification"
        elif "expired" in statuses:
            payment_status = "expired"
        else:
            payment_status = statuses[0] if statuses else "unpaid"
        has_access = True
        if lesson:
            from app.services.progress import enrolment_covers_lesson

            has_access = any(
                r.get("status") == "active" and enrolment_covers_lesson(r, lesson) for r in rows
            ) or u.get("role") in ("admin", "lecturer")
        participants.append(
            {
                "user_id": uid,
                "name": u.get("name"),
                "email": u.get("email"),
                "role": u.get("role"),
                "blocked": uid in blocked,
                "payment_status": payment_status,
                "has_lesson_access": has_access,
                "enrolments": serialize_many(
                    sorted(rows, key=lambda r: r.get("created_at") or _now(), reverse=True)
                ),
            }
        )
    participants.sort(key=lambda p: (p["payment_status"] != "paid", (p["name"] or "").lower()))
    return {"session": _public_view(doc, True), "participants": participants}


@router.post("/live-sessions/{sid}/participants", response_model=dict)
async def set_participant_block(sid: str, body: dict, user: dict = Depends(require_staff)):
    """Block/unblock a student for this session (applies to the whole series)."""
    db = get_db()
    doc = await _get_session(db, sid)
    programme = await db.programmes.find_one({"_id": doc["programme_id"]})
    if not programme or not _is_owner(user, programme):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the admin or the lecturer who created this course can manage its class list")
    user_id = (body.get("user_id") or "").strip()
    blocked = bool(body.get("blocked"))
    if not user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "user_id required")
    target_user = await db.users.find_one({"_id": user_id})
    if not target_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    query = {"series_id": doc["series_id"]} if doc.get("series_id") else {"_id": sid}
    op = {"$addToSet": {"blocked_user_ids": user_id}} if blocked else {"$pull": {"blocked_user_ids": user_id}}
    await db.live_sessions.update_many(query, op)
    action = "blocked" if blocked else "unblocked"
    await emit("staff", "live.changed", {"programme_id": doc["programme_id"], "action": action, "user_id": user_id})
    await emit("user:{uid}".format(uid=user_id), "live.changed", {"session_id": doc["_id"], "blocked": blocked})
    return {"ok": True, "user_id": user_id, "blocked": blocked, "message": f"Student {action}"}


@router.get("/live-sessions/mine", response_model=list[dict])
async def my_live_sessions(user: dict = Depends(get_current_user)):
    """Upcoming live sessions across programmes the user can access."""
    db = get_db()
    now = _now()
    enrolments = await db.enrolments.find({"user_id": user["_id"], "status": "active"}).to_list(200)
    pids = {e["programme_id"] for e in enrolments}
    is_staff = user.get("role") in ("admin", "lecturer")
    if is_staff:
        query: dict = {"start_time": {"$gte": now}}
        if user.get("role") != "admin":
            # Lecturers only see classes for courses they own (plus legacy unowned)
            own = await db.programmes.find(
                {"$or": [{"created_by": None}, {"created_by": user["_id"]}]}
            ).to_list(500)
            query["programme_id"] = {"$in": [p["_id"] for p in own]}
        docs = await (
            db.live_sessions.find(query)
            .sort("start_time", 1)
            .to_list(100)
        )
        return [_public_view(d, True) for d in docs]
    if not pids:
        return []
    docs = await (
        db.live_sessions.find({"programme_id": {"$in": list(pids)}, "start_time": {"$gte": now}})
        .sort("start_time", 1)
        .to_list(100)
    )
    return [_public_view(d, True) for d in docs]
