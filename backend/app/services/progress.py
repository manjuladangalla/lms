"""Progress + access helpers."""
from datetime import datetime, timezone


def aware(dt: datetime | None) -> datetime | None:
    """Coerce to aware UTC (Mongo/motor may return naive datetimes)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def lesson_schedule(db, lesson: dict) -> dict:
    """Effective schedule for a lesson: lesson fields override module window.

    Opt-in: any field that was never set by admin/lecturer is None = no rule.
    """
    available_at = lesson.get("available_at")
    due_at = lesson.get("due_at")
    if lesson.get("subject_id"):
        subject = await db.subjects.find_one({"_id": lesson["subject_id"]})
        if subject:
            if available_at is None:
                available_at = subject.get("start_at")
            if due_at is None:
                due_at = subject.get("due_at")
    return {"available_at": aware(available_at), "due_at": aware(due_at)}


def is_locked(schedule: dict, now: datetime | None = None) -> bool:
    """True only when an available_at date was explicitly set and has not been reached."""
    av = schedule.get("available_at")
    if av is None:
        return False
    return av > (now or datetime.now(timezone.utc))


async def recompute_enrolment_progress(db, enrolment: dict) -> dict:
    pid = enrolment["programme_id"]
    uid = enrolment["user_id"]
    total = await db.lessons.count_documents({"programme_id": pid})
    done = await db.lesson_progress.count_documents(
        {"user_id": uid, "programme_id": pid, "status": "completed"}
    )
    percent = int(round((done / total) * 100)) if total else 0
    update = {"progress_percent": percent, "total_lessons": total, "completed_lessons": done}
    if percent >= 100 and total > 0:
        update["completed_at"] = enrolment.get("completed_at") or datetime.now(timezone.utc)
    await db.enrolments.update_one({"_id": enrolment["_id"]}, {"$set": update})
    enrolment.update(update)
    return enrolment


async def active_membership(db, user_id: str) -> dict | None:
    now = datetime.now(timezone.utc)
    m = await db.memberships.find_one(
        {"user_id": user_id, "status": "active", "expires_at": {"$gt": now}}
    )
    return m


async def active_enrolments(db, user_id: str, programme_id: str) -> list[dict]:
    """All active, non-expired enrolments (full, module or lesson scope).

    Expiry is enforced lazily: past `access_expires_at` marks the enrolment expired.
    """
    now = datetime.now(timezone.utc)
    enrols = await db.enrolments.find(
        {"user_id": user_id, "programme_id": programme_id, "status": "active"}
    ).to_list(50)
    live = []
    for e in enrols:
        exp = aware(e.get("access_expires_at"))
        if exp is not None and exp < now:
            await db.enrolments.update_one({"_id": e["_id"]}, {"$set": {"status": "expired"}})
            continue
        live.append(e)
    return live


async def active_enrolment(db, user_id: str, programme_id: str) -> dict | None:
    live = await active_enrolments(db, user_id, programme_id)
    return live[0] if live else None


def enrolment_covers_lesson(enrolment: dict, lesson: dict) -> bool:
    """True when this enrolment's scope grants access to the lesson."""
    sk = enrolment.get("scope_key") or "programme"
    if sk == "programme":
        return True
    if lesson.get("subject_id") and sk == f"subject:{lesson['subject_id']}":
        return True
    if sk == f"lesson:{lesson['_id']}":
        return True
    return False


def bundle_is_free(programme: dict) -> bool:
    """Whole-programme free access.

    Price-0 programmes are free, except per-module/per-lesson pricing where
    individual scope prices are sold (a 0 bundle price does not bypass them).
    """
    if programme.get("is_free"):
        return True
    mode = programme.get("pricing_mode") or "once"
    return float(programme.get("price") or 0) == 0 and mode not in ("per_lesson", "per_module")


def staff_can_view(user: dict | None, programme: dict) -> bool:
    """Admin always; lecturer only for courses they created (legacy unowned = any staff)."""
    if not user:
        return False
    role = user.get("role")
    if role == "admin":
        return True
    if role == "lecturer":
        owner = programme.get("created_by")
        return owner is None or owner == user["_id"]
    return False


async def can_access_lesson(db, user: dict, lesson: dict) -> bool:
    programme = await db.programmes.find_one({"_id": lesson["programme_id"]})
    if not programme:
        return False
    if staff_can_view(user, programme):
        return True
    if bundle_is_free(programme):
        return True
    if lesson.get("is_free_preview") or lesson.get("is_free"):
        return True
    if programme.get("status") != "published":
        return False
    for e in await active_enrolments(db, user["_id"], programme["_id"]):
        if enrolment_covers_lesson(e, lesson):
            return True
    return False


async def has_programme_access(db, user: dict, programme: dict) -> bool:
    if staff_can_view(user, programme):
        return True
    if bundle_is_free(programme):
        return programme.get("status") == "published"
    if await active_enrolment(db, user["_id"], programme["_id"]):
        return True
    return False
