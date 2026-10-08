from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from slugify import slugify

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user, require_staff
from app.events import emit
from app.models.common import MessageOut, Page, serialize, serialize_many
from app.models.content import LessonIn, MaterialIn, ProgrammeIn, SubjectIn
from app.services.cache import get_cached, invalidate_public_cache, set_cached

router = APIRouter(prefix="/programmes", tags=["programmes"])


async def _get_programme(db, pid: str) -> dict:
    doc = await db.programmes.find_one({"_id": pid})
    if not doc:
        doc = await db.programmes.find_one({"slug": pid})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not found")
    return doc


def _is_owner(user: dict | None, doc: dict) -> bool:
    """Manage rights: any admin, or the lecturer who created the course.
    Legacy courses without created_by stay staff-manageable."""
    if not user:
        return False
    if user.get("role") == "admin":
        return True
    if user.get("role") != "lecturer":
        return False
    owner = doc.get("created_by")
    return owner is None or owner == user["_id"]


async def _manage_programme(db, user: dict, pid: str) -> dict:
    doc = await _get_programme(db, pid)
    if not _is_owner(user, doc):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the admin or the lecturer who created this course can manage it")
    return doc


@router.get("", response_model=Page[dict])
async def list_programmes(
    request: Request,
    type: str | None = None,
    q: str | None = None,
    category: str | None = None,
    status_: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=100),
    user: dict | None = Depends(get_optional_user),
):
    db = get_db()
    is_admin = bool(user and user.get("role") == "admin")
    is_staff = bool(user and user.get("role") in ("admin", "lecturer"))
    query: dict = {}
    if is_staff and not is_admin:
        # Lecturers manage their own courses plus everything published
        query["$or"] = [{"status": "published"}, {"created_by": None}]
        query["$or"].append({"created_by": user["_id"]})
        if status_:
            query["status"] = status_
    elif not is_staff:
        query["status"] = "published"
    elif status_:
        query["status"] = status_
    if type:
        query["type"] = type
    if category:
        query["category"] = category
    if q:
        or_terms = [
            {"title": {"$regex": q, "$options": "i"}},
            {"summary": {"$regex": q, "$options": "i"}},
            {"category": {"$regex": q, "$options": "i"}},
        ]
        if "$or" in query:
            query["$and"] = [{"$or": query.pop("$or")}, {"$or": or_terms}]
        else:
            query["$or"] = or_terms

    # Results are user-scoped for lecturers — never share that cache
    audience = "public" if not is_staff else ("admin" if is_admin else "never")
    cache_key = f"programmes:list:{type or ''}:{category or ''}:{q or ''}:{status_ or ''}:{page}:{size}:{audience}"
    if not q and audience != "never":
        cached = await get_cached(cache_key)
        if cached:
            return cached

    total = await db.programmes.count_documents(query)
    cursor = db.programmes.find(query).sort([("sort_order", 1), ("created_at", -1)]).skip((page - 1) * size).limit(size)
    items = serialize_many(await cursor.to_list(length=size))
    result = Page[dict](items=items, total=total, page=page, size=size)
    if not q and audience != "never":
        await set_cached(cache_key, result.model_dump(), ttl=60)
    return result


@router.post("", response_model=dict)
async def create_programme(body: ProgrammeIn, user: dict = Depends(require_staff)):
    db = get_db()
    base_slug = slugify(body.slug or body.title)
    slug = base_slug
    i = 1
    while await db.programmes.find_one({"slug": slug}):
        slug = f"{base_slug}-{i}"
        i += 1
    doc = body.model_dump()
    doc["_id"] = uuid4().hex
    doc["slug"] = slug
    doc["created_by"] = user["_id"]
    doc["created_at"] = datetime.now(timezone.utc)
    doc["updated_at"] = datetime.now(timezone.utc)
    doc.setdefault("currency", None)
    await db.programmes.insert_one(doc)
    await invalidate_public_cache()
    await emit("public", "programmes.changed", {"id": doc["_id"], "action": "created"})
    return serialize(doc)


@router.get("/{pid}", response_model=dict)
async def get_programme(pid: str, user: dict | None = Depends(get_optional_user)):
    db = get_db()
    doc = await _get_programme(db, pid)
    # Staff privileges (draft view, ungated content) only for admins / the course's lecturer
    is_staff = _is_owner(user, doc) if (user and user.get("role") in ("admin", "lecturer")) else False
    if doc.get("status") != "published" and not is_staff:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not found")
    out = serialize(doc)
    from app.services.progress import aware, is_locked, lesson_schedule

    # ---- viewer entitlement: full / per-module / per-lesson scope ----
    full_access = is_staff
    scope_subjects: set[str] = set()
    scope_lessons: set[str] = set()
    if not is_staff:
        pricing_mode = doc.get("pricing_mode") or "once"
        bundle_free = bool(doc.get("is_free")) or (
            float(doc.get("price") or 0) == 0 and pricing_mode not in ("per_lesson", "per_module")
        )
        if bundle_free:
            full_access = True
        elif user:
            enrols = await db.enrolments.find(
                {"user_id": user["_id"], "programme_id": doc["_id"], "status": "active"}
            ).to_list(50)
            now = datetime.now(timezone.utc)
            for e in enrols:
                exp = aware(e.get("access_expires_at"))
                if exp is not None and exp < now:
                    continue
                sk = e.get("scope_key") or "programme"
                if sk == "programme":
                    full_access = True
                elif sk.startswith("subject:"):
                    scope_subjects.add(sk.split(":", 1)[1])
                elif sk.startswith("lesson:"):
                    scope_lessons.add(sk.split(":", 1)[1])

    def _lesson_visible(l: dict, subject_id: str) -> bool:
        if is_staff or full_access:
            return True
        if l.get("is_free_preview") or l.get("is_free"):
            return True
        return l["_id"] in scope_lessons or subject_id in scope_subjects

    all_materials = await db.materials.find({"programme_id": doc["_id"]}).sort("created_at", 1).to_list(length=500)
    prog_resources = [
        serialize(m) for m in all_materials if not m.get("subject_id") and not m.get("lesson_id")
    ]
    subj_resources = {
        m["subject_id"]: [] for m in all_materials if m.get("subject_id") and not m.get("lesson_id")
    }
    for m in all_materials:
        if m.get("subject_id") and not m.get("lesson_id"):
            subj_resources[m["subject_id"]].append(serialize(m))
    lesson_resources: dict[str, list] = {}
    for m in all_materials:
        if m.get("lesson_id"):
            lesson_resources.setdefault(m["lesson_id"], []).append(serialize(m))

    subjects = await db.subjects.find({"programme_id": doc["_id"]}).sort("sort_order", 1).to_list(length=200)
    subj_out = []
    for s in subjects:
        s_ser = serialize(s)
        lessons = await db.lessons.find({"subject_id": s["_id"]}).sort("sort_order", 1).to_list(length=500)
        if not is_staff:
            lessons = [l for l in lessons if not l.get("hidden")]
        module_locked = is_locked({"available_at": aware(s.get("start_at"))})
        s_ser["resources"] = subj_resources.get(s["_id"], [])
        if not is_staff and (module_locked or not (full_access or s["_id"] in scope_subjects)):
            s_ser["resources"] = []
        lesson_rows = []
        for l in lessons:
            preview = bool(l.get("is_free_preview") or l.get("is_free"))
            visible = _lesson_visible(l, s["_id"])
            row = {
                **serialize(l),
                "content": l.get("content") if (is_staff or visible) else None,
                "resources": lesson_resources.get(l["_id"], []) if (is_staff or visible) else [],
            }
            if not is_staff:
                schedule = await lesson_schedule(db, l)
                locked = is_locked(schedule)
                # Effective schedule (lesson overrides module window) for student badges
                row["available_at"] = schedule["available_at"]
                row["due_at"] = schedule["due_at"]
                row["locked"] = locked
                row["purchased"] = bool(is_staff or visible)
                if locked:
                    row["content"] = None
                    row["resources"] = []
            lesson_rows.append(row)
        s_ser["lessons"] = lesson_rows
        subj_out.append(s_ser)
    out["subjects"] = subj_out
    out["materials"] = prog_resources
    instructors = []
    for iid in doc.get("instructor_ids") or []:
        u = await db.users.find_one({"_id": iid})
        if u:
            instructors.append({"id": u["_id"], "name": u["name"], "avatar_url": u.get("avatar_url")})
    out["instructors"] = instructors
    return out


@router.put("/{pid}", response_model=dict)
async def update_programme(pid: str, body: ProgrammeIn, user: dict = Depends(require_staff)):
    db = get_db()
    doc = await _manage_programme(db, user, pid)
    data = body.model_dump()
    data["updated_at"] = datetime.now(timezone.utc)
    await db.programmes.update_one({"_id": doc["_id"]}, {"$set": data})
    await invalidate_public_cache()
    doc.update(data)
    await emit("public", "programmes.changed", {"id": doc["_id"], "action": "updated"})
    return serialize(doc)


@router.delete("/{pid}", response_model=MessageOut)
async def delete_programme(pid: str, user: dict = Depends(require_staff)):
    db = get_db()
    doc = await _manage_programme(db, user, pid)
    await db.programmes.delete_one({"_id": doc["_id"]})
    await db.subjects.delete_many({"programme_id": doc["_id"]})
    await db.lessons.delete_many({"programme_id": doc["_id"]})
    await db.materials.delete_many({"programme_id": doc["_id"]})
    await db.exams.delete_many({"programme_id": doc["_id"]})
    await invalidate_public_cache()
    await emit("public", "programmes.changed", {"id": doc["_id"], "action": "deleted"})
    return MessageOut(message="Programme deleted")


@router.post("/{pid}/subjects", response_model=dict)
async def create_subject(pid: str, body: SubjectIn, user: dict = Depends(require_staff)):
    db = get_db()
    programme = await _manage_programme(db, user, pid)
    doc = body.model_dump()
    doc["_id"] = uuid4().hex
    doc["programme_id"] = programme["_id"]
    doc["created_at"] = datetime.now(timezone.utc)
    await db.subjects.insert_one(doc)
    await invalidate_public_cache()
    await emit("public", "programmes.changed", {"id": programme["_id"], "action": "updated"})
    return serialize(doc)


@router.put("/{pid}/subjects/{sid}", response_model=dict)
async def update_subject(pid: str, sid: str, body: SubjectIn, user: dict = Depends(require_staff)):
    db = get_db()
    programme = await _manage_programme(db, user, pid)
    doc = await db.subjects.find_one({"_id": sid, "programme_id": programme["_id"]})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subject not found")
    data = body.model_dump()
    await db.subjects.update_one({"_id": sid}, {"$set": data})
    doc.update(data)
    await invalidate_public_cache()
    await emit("public", "programmes.changed", {"id": programme["_id"], "action": "updated"})
    return serialize(doc)


@router.delete("/{pid}/subjects/{sid}", response_model=MessageOut)
async def delete_subject(pid: str, sid: str, user: dict = Depends(require_staff)):
    db = get_db()
    programme = await _manage_programme(db, user, pid)
    doc = await db.subjects.find_one({"_id": sid, "programme_id": programme["_id"]})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subject not found")
    await db.subjects.delete_one({"_id": sid, "programme_id": programme["_id"]})
    await db.lessons.delete_many({"subject_id": sid})
    await db.materials.delete_many({"programme_id": programme["_id"], "subject_id": sid, "lesson_id": None})
    await invalidate_public_cache()
    await emit("public", "programmes.changed", {"id": programme["_id"], "action": "updated"})
    return MessageOut(message="Subject deleted")


@router.post("/{pid}/lessons", response_model=dict)
async def create_lesson(pid: str, body: LessonIn, subject_id: str, user: dict = Depends(require_staff)):
    db = get_db()
    programme = await _manage_programme(db, user, pid)
    doc = body.model_dump()
    doc["_id"] = uuid4().hex
    doc["programme_id"] = programme["_id"]
    doc["subject_id"] = subject_id
    doc["created_at"] = datetime.now(timezone.utc)
    await db.lessons.insert_one(doc)
    await invalidate_public_cache()
    await emit("public", "programmes.changed", {"id": programme["_id"], "action": "updated"})
    return serialize(doc)


@router.put("/{pid}/lessons/{lid}", response_model=dict)
async def update_lesson(pid: str, lid: str, body: LessonIn, user: dict = Depends(require_staff)):
    db = get_db()
    programme = await _manage_programme(db, user, pid)
    doc = await db.lessons.find_one({"_id": lid, "programme_id": programme["_id"]})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")
    data = body.model_dump()
    data["updated_at"] = datetime.now(timezone.utc)
    await db.lessons.update_one({"_id": lid}, {"$set": data})
    doc.update(data)
    await invalidate_public_cache()
    await emit("public", "programmes.changed", {"id": programme["_id"], "action": "updated"})
    return serialize(doc)


@router.delete("/{pid}/lessons/{lid}", response_model=MessageOut)
async def delete_lesson(pid: str, lid: str, user: dict = Depends(require_staff)):
    db = get_db()
    programme = await _manage_programme(db, user, pid)
    doc = await db.lessons.find_one({"_id": lid, "programme_id": programme["_id"]})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")
    await db.lessons.delete_one({"_id": lid, "programme_id": programme["_id"]})
    await db.materials.delete_many({"programme_id": programme["_id"], "lesson_id": lid})
    await invalidate_public_cache()
    await emit("public", "programmes.changed", {"id": programme["_id"], "action": "updated"})
    return MessageOut(message="Lesson deleted")


@router.post("/{pid}/materials", response_model=dict)
async def create_material(pid: str, body: MaterialIn, user: dict = Depends(require_staff)):
    db = get_db()
    programme = await _manage_programme(db, user, pid)
    doc = body.model_dump()
    if doc.get("subject_id"):
        subject = await db.subjects.find_one({"_id": doc["subject_id"], "programme_id": programme["_id"]})
        if not subject:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Subject does not belong to this programme")
    if doc.get("lesson_id"):
        lesson = await db.lessons.find_one({"_id": doc["lesson_id"], "programme_id": programme["_id"]})
        if not lesson:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lesson does not belong to this programme")
        if not doc.get("subject_id"):
            doc["subject_id"] = lesson.get("subject_id")
    doc["_id"] = uuid4().hex
    doc["programme_id"] = programme["_id"]
    doc["created_at"] = datetime.now(timezone.utc)
    doc["uploaded_by"] = user["_id"]
    await db.materials.insert_one(doc)
    await emit("public", "programmes.changed", {"id": programme["_id"], "action": "updated"})
    return serialize(doc)


@router.delete("/{pid}/materials/{mid}", response_model=MessageOut)
async def delete_material(pid: str, mid: str, user: dict = Depends(require_staff)):
    db = get_db()
    programme = await _manage_programme(db, user, pid)
    await db.materials.delete_one({"_id": mid, "programme_id": programme["_id"]})
    return MessageOut(message="Material deleted")
