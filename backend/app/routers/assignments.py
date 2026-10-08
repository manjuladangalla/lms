from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_db
from app.core.deps import get_current_user, require_staff
from app.models.common import MessageOut, serialize, serialize_many
from app.models.content import AssignmentGradeIn, AssignmentIn, AssignmentSubmitIn, AssignmentUpdateIn
from app.services.progress import has_programme_access, staff_can_view

router = APIRouter(tags=["assignments"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _get_assignment(db, aid: str) -> dict:
    doc = await db.assignments.find_one({"_id": aid})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    return doc


async def _require_access(db, user: dict, programme_id: str) -> None:
    programme = await db.programmes.find_one({"_id": programme_id})
    if not programme or not await has_programme_access(db, user, programme):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this programme")


async def _require_owner(db, user: dict, programme_id: str) -> dict:
    from app.routers.content import _is_owner

    programme = await db.programmes.find_one({"_id": programme_id})
    if not programme:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not found")
    if not _is_owner(user, programme):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the admin or the lecturer who created this course can manage it")
    return programme


async def _maybe_auto_certificate(db, user_id: str, programme_id: str) -> None:
    """Issue certificate automatically when progress + weighted grade pass."""
    from app.routers.learning import try_auto_issue_certificate

    try:
        await try_auto_issue_certificate(db, user_id, programme_id)
    except Exception as exc:  # noqa: BLE001 — never block grading on cert failure
        print(f"[cert-auto] {exc}")


@router.get("/programmes/{pid}/assignments", response_model=list[dict])
async def list_assignments(pid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    programme = await db.programmes.find_one({"_id": pid})
    await _require_access(db, user, pid)
    docs = await db.assignments.find({"programme_id": pid}).sort("created_at", 1).to_list(length=200)
    out = serialize_many(docs)
    is_staff = staff_can_view(user, programme or {})
    for a in out:
        if not is_staff:
            sub = await db.assignment_submissions.find_one({"assignment_id": a["id"], "user_id": user["_id"]})
            a["submission"] = serialize(sub)
        else:
            a["submission_count"] = await db.assignment_submissions.count_documents({"assignment_id": a["id"]})
        subject = await db.subjects.find_one({"_id": a.get("subject_id")})
        a["subject"] = {"id": subject["_id"], "title": subject["title"]} if subject else None
        if not is_staff and a.get("status") != "published":
            out = [x for x in out if x.get("status") == "published"]
    return [a for a in out if is_staff or a.get("status") == "published"]


@router.post("/programmes/{pid}/assignments", response_model=dict)
async def create_assignment(pid: str, body: AssignmentIn, user: dict = Depends(require_staff)):
    db = get_db()
    programme = await _require_owner(db, user, pid)
    subject = await db.subjects.find_one({"_id": body.subject_id, "programme_id": pid})
    if not subject:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Subject does not belong to this programme")
    doc = body.model_dump()
    doc["_id"] = uuid4().hex
    doc["programme_id"] = pid
    doc["created_at"] = _now()
    doc["updated_at"] = _now()
    await db.assignments.insert_one(doc)
    return serialize(doc)


@router.put("/assignments/{aid}", response_model=dict)
async def update_assignment(aid: str, body: AssignmentUpdateIn, user: dict = Depends(require_staff)):
    db = get_db()
    doc = await _get_assignment(db, aid)
    await _require_owner(db, user, doc["programme_id"])
    data = body.model_dump()
    data["updated_at"] = _now()
    await db.assignments.update_one({"_id": aid}, {"$set": data})
    doc.update(data)
    return serialize(doc)


@router.delete("/assignments/{aid}", response_model=MessageOut)
async def delete_assignment(aid: str, user: dict = Depends(require_staff)):
    db = get_db()
    doc = await _get_assignment(db, aid)
    await _require_owner(db, user, doc["programme_id"])
    await db.assignments.delete_one({"_id": aid})
    await db.assignment_submissions.delete_many({"assignment_id": aid})
    return MessageOut(message="Assignment deleted")


@router.post("/assignments/{aid}/submit", response_model=dict)
async def submit_assignment(aid: str, body: AssignmentSubmitIn, user: dict = Depends(get_current_user)):
    db = get_db()
    assignment = await _get_assignment(db, aid)
    if assignment.get("status") != "published" and user.get("role") not in ("admin", "lecturer"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Assignment not published")
    await _require_access(db, user, assignment["programme_id"])
    if not (body.text or "").strip() and not body.file_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Submit text or a file")

    existing = await db.assignment_submissions.find_one({"assignment_id": aid, "user_id": user["_id"]})
    doc = {
        "assignment_id": aid,
        "user_id": user["_id"],
        "programme_id": assignment["programme_id"],
        "subject_id": assignment.get("subject_id"),
        "max_marks": assignment.get("max_marks", 100),
        "text": body.text,
        "file_url": body.file_url,
        "submitted_at": _now(),
        "status": "submitted",
        "score": None,
        "feedback": "",
        "graded_by": None,
        "graded_at": None,
        "updated_at": _now(),
    }
    if existing:
        doc["created_at"] = existing.get("created_at", _now())
        await db.assignment_submissions.replace_one({"_id": existing["_id"]}, {"_id": existing["_id"], **doc})
        doc["_id"] = existing["_id"]
    else:
        doc["_id"] = uuid4().hex
        doc["created_at"] = _now()
        await db.assignment_submissions.insert_one(doc)
    return serialize(doc)


@router.get("/assignments/{aid}/submission")
async def my_submission(aid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    assignment = await _get_assignment(db, aid)
    await _require_access(db, user, assignment["programme_id"])
    sub = await db.assignment_submissions.find_one({"assignment_id": aid, "user_id": user["_id"]})
    return serialize(sub) or {}


@router.get("/assignments/{aid}/submissions", response_model=list[dict])
async def list_submissions(aid: str, user: dict = Depends(require_staff)):
    db = get_db()
    assignment = await _get_assignment(db, aid)
    await _require_owner(db, user, assignment["programme_id"])
    docs = await db.assignment_submissions.find({"assignment_id": aid}).to_list(length=500)
    out = serialize_many(docs)
    for s in out:
        u = await db.users.find_one({"_id": s["user_id"]})
        s["student"] = {"id": u["_id"], "name": u["name"], "email": u["email"]} if u else None
    return out


@router.post("/submissions/{sid}/grade", response_model=dict)
async def grade_submission(sid: str, body: AssignmentGradeIn, staff: dict = Depends(require_staff)):
    db = get_db()
    sub = await db.assignment_submissions.find_one({"_id": sid})
    if not sub:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Submission not found")
    if sub.get("programme_id"):
        await _require_owner(db, staff, sub["programme_id"])
    max_marks = float(sub.get("max_marks") or 100) or 100
    if body.score > max_marks:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Score cannot exceed {max_marks}")
    update = {
        "score": float(body.score),
        "feedback": body.feedback,
        "status": "graded",
        "graded_by": staff["_id"],
        "graded_at": _now(),
        "updated_at": _now(),
    }
    await db.assignment_submissions.update_one({"_id": sid}, {"$set": update})
    sub.update(update)
    if sub.get("programme_id"):
        await _maybe_auto_certificate(db, sub["user_id"], sub["programme_id"])
    return serialize(sub)


@router.get("/assignments/mine", response_model=list[dict])
async def my_assignments(user: dict = Depends(get_current_user)):
    db = get_db()
    enrolments = await db.enrolments.find({"user_id": user["_id"], "status": "active"}).to_list(length=200)
    pids = [e["programme_id"] for e in enrolments]
    if not pids:
        return []
    docs = await db.assignments.find({"programme_id": {"$in": pids}, "status": "published"}).to_list(length=500)
    out = serialize_many(docs)
    for a in out:
        sub = await db.assignment_submissions.find_one({"assignment_id": a["id"], "user_id": user["_id"]})
        a["submission"] = serialize(sub)
        prog = await db.programmes.find_one({"_id": a["programme_id"]})
        a["programme"] = {"id": prog["_id"], "title": prog["title"]} if prog else None
        subject = await db.subjects.find_one({"_id": a.get("subject_id")})
        a["subject"] = {"id": subject["_id"], "title": subject["title"]} if subject else None
    out.sort(key=lambda a: a.get("created_at") or "")
    return out
