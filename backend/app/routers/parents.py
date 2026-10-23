from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_parent
from app.events import emit
from app.models.commerce import ParentChildIn, ParentEnrolIn, ParentLinkAdminIn, ParentLinkStatusIn
from app.models.common import MessageOut, Page, serialize, serialize_many

router = APIRouter(prefix="/parents", tags=["parents"])

ACTIVE_LINK = "active"


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _active_link(db, parent_id: str, student_id: str) -> dict | None:
    return await db.parent_students.find_one(
        {"parent_id": parent_id, "student_id": student_id, "status": ACTIVE_LINK}
    )


async def _hydrate_student(db, student_id: str) -> dict | None:
    u = await db.users.find_one({"_id": student_id})
    if not u:
        return None
    return {"id": u["_id"], "name": u["name"], "email": u["email"], "role": u.get("role")}


async def _hydrate_parent(db, parent_id: str) -> dict | None:
    u = await db.users.find_one({"_id": parent_id})
    if not u:
        return None
    return {"id": u["_id"], "name": u["name"], "email": u["email"]}


# ---------------- Parent: children ----------------

@router.get("/children", response_model=Page[dict])
async def my_children(parent: dict = Depends(require_parent)):
    db = get_db()
    links = await db.parent_students.find({"parent_id": parent["_id"]}).sort("created_at", -1).to_list(length=100)
    out = []
    for link in serialize_many(links):
        link["student"] = await _hydrate_student(db, link["student_id"])
        if link["student"]:
            n_active = await db.enrolments.count_documents({"user_id": link["student_id"], "status": "active"})
            n_pending = await db.enrolments.count_documents(
                {"user_id": link["student_id"], "status": {"$in": ["pending_acceptance", "pending_approval"]}}
            )
            link["student"]["active_enrolments"] = n_active
            link["student"]["pending_enrolments"] = n_pending
        out.append(link)
    return Page[dict](items=out, total=len(out), page=1, size=len(out) or 1)


@router.post("/children", response_model=dict)
async def add_child(body: ParentChildIn, parent: dict = Depends(require_parent)):
    db = get_db()
    student = await db.users.find_one({"email": body.email.lower()})
    if not student or student.get("role") != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No student account with that email")
    if student["_id"] == parent["_id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot link your own account")
    existing = await db.parent_students.find_one({"parent_id": parent["_id"], "student_id": student["_id"]})
    if existing and existing.get("status") == ACTIVE_LINK:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This child is already linked")
    if existing and existing.get("status") == "pending":
        return {"message": "Link request already sent — awaiting admin approval", "link": serialize(existing)}

    link = {
        "_id": uuid4().hex,
        "parent_id": parent["_id"],
        "student_id": student["_id"],
        "status": "pending",
        "requested_by": parent["_id"],
        "requested_by_role": "parent",
        "reason": None,
        "decided_by": None,
        "decided_at": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.parent_students.insert_one(link)
    await emit("admin", "parent_link.created", {"link_id": link["_id"], "student_id": student["_id"]})
    return {"message": "Link request sent — awaiting admin approval", "link": serialize(link)}


@router.delete("/links/{link_id}", response_model=MessageOut)
async def remove_link(link_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    link = await db.parent_students.find_one({"_id": link_id})
    if not link:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")
    is_admin = user.get("role") == "admin"
    if not is_admin and user["_id"] not in (link["parent_id"], link["student_id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your link")
    await db.parent_students.delete_one({"_id": link_id})
    return MessageOut(message="Link removed")


# ---------------- Parent: enrolments ----------------

@router.get("/children/{student_id}/overview", response_model=dict)
async def child_overview(student_id: str, parent: dict = Depends(require_parent)):
    """Everything a parent may see about a child: progress, certificates, lecture notes."""
    db = get_db()
    if not await _active_link(db, parent["_id"], student_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your linked child")
    student = await _hydrate_student(db, student_id)
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")

    enrol_docs = await db.enrolments.find({"user_id": student_id}).sort("created_at", -1).to_list(length=200)
    enrolments = serialize_many(enrol_docs)
    for e in enrolments:
        prog = await db.programmes.find_one({"_id": e["programme_id"]})
        e["programme"] = serialize(prog) if prog else None
        lessons = await db.lessons.count_documents({"programme_id": e["programme_id"]})
        done = await db.lesson_progress.count_documents(
            {"user_id": student_id, "programme_id": e["programme_id"], "status": "completed"}
        )
        e["total_lessons"] = lessons
        e["completed_lessons"] = done

    certs = serialize_many(
        await db.certificates.find({"user_id": student_id}).sort("issued_at", -1).to_list(length=100)
    )
    for c in certs:
        if c.get("programme_id"):
            prog = await db.programmes.find_one({"_id": c["programme_id"]})
            c["programme"] = {"id": prog["_id"], "title": prog["title"]} if prog else None

    note_docs = await db.student_notes.find({"student_id": student_id}).sort("created_at", -1).to_list(length=100)
    notes = serialize_many(note_docs)
    for n in notes:
        author = await db.users.find_one({"_id": n.get("author_id")})
        n["author"] = (
            {"id": author["_id"], "name": author["name"], "role": author.get("role")} if author else None
        )
        if n.get("programme_id"):
            prog = await db.programmes.find_one({"_id": n["programme_id"]})
            n["programme"] = {"id": prog["_id"], "title": prog["title"]} if prog else None

    return {
        "student": student,
        "enrolments": enrolments,
        "certificates": certs,
        "notes": notes,
    }


@router.get("/children/{student_id}/enrolments", response_model=Page[dict])
async def child_enrolments(student_id: str, parent: dict = Depends(require_parent)):
    db = get_db()
    if not await _active_link(db, parent["_id"], student_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your linked child")
    docs = await db.enrolments.find({"user_id": student_id}).sort("created_at", -1).to_list(length=200)
    out = serialize_many(docs)
    for e in out:
        prog = await db.programmes.find_one({"_id": e["programme_id"]})
        e["programme"] = serialize(prog) if prog else None
        if e.get("requested_by"):
            e["requested_by_user"] = await _hydrate_parent(db, e["requested_by"])
    return Page[dict](items=out, total=len(out), page=1, size=len(out) or 1)


@router.get("/enrolments/awaiting", response_model=Page[dict])
async def awaiting_acceptance(parent: dict = Depends(require_parent)):
    """Staff-created enrolments for linked children that the student/parent can accept."""
    db = get_db()
    links = await db.parent_students.find({"parent_id": parent["_id"], "status": ACTIVE_LINK}).to_list(length=100)
    student_ids = [l["student_id"] for l in links]
    if not student_ids:
        return Page[dict](items=[], total=0, page=1, size=1)
    docs = await db.enrolments.find(
        {"user_id": {"$in": student_ids}, "status": "pending_acceptance"}
    ).sort("created_at", -1).to_list(length=100)
    out = serialize_many(docs)
    for e in out:
        prog = await db.programmes.find_one({"_id": e["programme_id"]})
        e["programme"] = serialize(prog) if prog else None
        e["student"] = await _hydrate_student(db, e["user_id"])
        if e.get("requested_by"):
            e["requested_by_user"] = await _hydrate_parent(db, e["requested_by"])
    return Page[dict](items=out, total=len(out), page=1, size=len(out) or 1)


@router.post("/enrolments", response_model=dict)
async def parent_enrol(body: ParentEnrolIn, parent: dict = Depends(require_parent)):
    db = get_db()
    if not await _active_link(db, parent["_id"], body.student_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your linked child")
    student = await db.users.find_one({"_id": body.student_id})
    if not student or student.get("role") != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")
    programme = await db.programmes.find_one({"_id": body.programme_id})
    if not programme or programme.get("status") != "published":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Programme not available")

    existing = await db.enrolments.find_one(
        {"user_id": student["_id"], "programme_id": programme["_id"], "scope_key": {"$in": [None, "programme"]}}
    )
    if existing and existing.get("status") in ("active", "pending_acceptance", "pending_approval", "pending_verification"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This child is already enrolled or has a pending request")

    now = _now()
    fields = {
        "status": "pending_approval",
        "source": "parent",
        "payment_id": None,
        "access_expires_at": None,
        "billing_interval": None,
        "scope_key": "programme",
        "scope_type": "programme",
        "scope_id": None,
        "pricing_mode": programme.get("pricing_mode") or "once",
        "base_amount": float(programme.get("price") or 0),
        "amount": 0.0,
        "currency": programme.get("currency"),
        "member_discount_percent": 0,
        "promo_code": None,
        "promo_discount_percent": 0,
        "requested_by": parent["_id"],
        "requested_by_role": "parent",
        "note": body.note,
        "decided_by": None,
        "decided_at": None,
        "decided_reason": None,
        "updated_at": now,
    }
    if existing:
        await db.enrolments.update_one({"_id": existing["_id"]}, {"$set": fields})
        enrolment = {**existing, **fields}
    else:
        enrolment = {
            "_id": uuid4().hex,
            "user_id": student["_id"],
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
    await emit("admin", "enrolment.created", {"enrolment_id": enrolment["_id"], "programme_id": programme["_id"], "user_id": student["_id"], "status": enrolment["status"]})
    await emit("user:{user_id}".format(user_id=student["_id"]), "enrolment.created", {"enrolment_id": enrolment["_id"], "programme_id": programme["_id"], "status": enrolment["status"]})
    return serialize(enrolment)


# ---------------- Admin: manage links ----------------

@router.get("/links", response_model=Page[dict])
async def admin_list_links(
    _: dict = Depends(require_admin),
    status_: str | None = None,
    q: str | None = None,
    page: int = 1,
    size: int = 50,
):
    db = get_db()
    query: dict = {}
    if status_:
        query["status"] = status_
    if q:
        users = await db.users.find(
            {"$or": [{"name": {"$regex": q, "$options": "i"}}, {"email": {"$regex": q, "$options": "i"}}]}
        ).to_list(length=200)
        ids = [u["_id"] for u in users]
        query["$or"] = [{"parent_id": {"$in": ids}}, {"student_id": {"$in": ids}}]
    total = await db.parent_students.count_documents(query)
    cursor = db.parent_students.find(query).sort("created_at", -1).skip((page - 1) * size).limit(size)
    items = serialize_many(await cursor.to_list(length=size))
    for link in items:
        link["parent"] = await _hydrate_parent(db, link["parent_id"])
        link["student"] = await _hydrate_student(db, link["student_id"])
        if link["student"]:
            link["student"]["active_enrolments"] = await db.enrolments.count_documents(
                {"user_id": link["student_id"], "status": "active"}
            )
            link["student"]["pending_enrolments"] = await db.enrolments.count_documents(
                {"user_id": link["student_id"], "status": {"$in": ["pending_acceptance", "pending_approval"]}}
            )
    return Page[dict](items=items, total=total, page=page, size=size)


@router.post("/links", response_model=dict)
async def admin_create_link(body: ParentLinkAdminIn, admin: dict = Depends(require_admin)):
    db = get_db()
    parent_user = await db.users.find_one({"email": body.parent_email.lower()})
    if not parent_user or parent_user.get("role") != "parent":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No parent account with that email")
    student = await db.users.find_one({"email": body.student_email.lower()})
    if not student or student.get("role") != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No student account with that email")
    existing = await db.parent_students.find_one({"parent_id": parent_user["_id"], "student_id": student["_id"]})
    if existing and existing.get("status") == ACTIVE_LINK:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Link already active")
    now = _now()
    if existing:
        await db.parent_students.update_one(
            {"_id": existing["_id"]},
            {"$set": {"status": ACTIVE_LINK, "decided_by": admin["_id"], "decided_at": now, "updated_at": now}},
        )
        link = {**existing, "status": ACTIVE_LINK}
    else:
        link = {
            "_id": uuid4().hex,
            "parent_id": parent_user["_id"],
            "student_id": student["_id"],
            "status": ACTIVE_LINK,
            "requested_by": admin["_id"],
            "requested_by_role": "admin",
            "reason": None,
            "decided_by": admin["_id"],
            "decided_at": now,
            "created_at": now,
            "updated_at": now,
        }
        await db.parent_students.insert_one(link)
    return serialize(link)


@router.patch("/links/{link_id}", response_model=dict)
async def admin_update_link(link_id: str, body: ParentLinkStatusIn, admin: dict = Depends(require_admin)):
    db = get_db()
    link = await db.parent_students.find_one({"_id": link_id})
    if not link:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")
    now = _now()
    await db.parent_students.update_one(
        {"_id": link_id},
        {"$set": {"status": body.status, "reason": body.reason, "decided_by": admin["_id"], "decided_at": now, "updated_at": now}},
    )
    link.update({"status": body.status, "decided_by": admin["_id"], "decided_at": now})
    return serialize(link)
