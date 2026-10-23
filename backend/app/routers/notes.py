from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_db
from app.core.deps import get_current_user, require_staff
from app.events import emit
from app.models.commerce import NoteIn
from app.models.common import MessageOut, Page, serialize, serialize_many

router = APIRouter(prefix="/notes", tags=["notes"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _owns_programme(db, user: dict, programme_id: str) -> bool:
    if user.get("role") == "admin":
        return True
    prog = await db.programmes.find_one({"_id": programme_id})
    if not prog:
        return False
    owner = prog.get("created_by")
    return owner is None or owner == user["_id"]


async def _can_view_student(db, user: dict, student_id: str) -> None:
    """Raise 403 unless the caller may see this student's notes."""
    if user["_id"] == student_id or user.get("role") == "admin":
        return
    if user.get("role") == "parent":
        link = await db.parent_students.find_one(
            {"parent_id": user["_id"], "student_id": student_id, "status": "active"}
        )
        if link:
            return
    if user.get("role") == "lecturer":
        # Lecturers see notes for students enrolled in courses they own (or they authored)
        progs = await db.programmes.find(
            {"$or": [{"created_by": None}, {"created_by": user["_id"]}]}
        ).to_list(500)
        ids = [p["_id"] for p in progs]
        if await db.enrolments.find_one({"user_id": student_id, "programme_id": {"$in": ids}}):
            return
        if await db.student_notes.find_one({"student_id": student_id, "author_id": user["_id"]}):
            return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot view this student's notes")


def _author(u: dict | None) -> dict | None:
    if not u:
        return None
    return {"id": u["_id"], "name": u["name"], "email": u["email"], "role": u.get("role")}


async def _hydrate(db, docs: list[dict]) -> list[dict]:
    out = serialize_many(docs)
    for n in out:
        author = await db.users.find_one({"_id": n.get("author_id")})
        n["author"] = _author(author)
        if n.get("programme_id"):
            prog = await db.programmes.find_one({"_id": n["programme_id"]})
            n["programme"] = {"id": prog["_id"], "title": prog["title"]} if prog else None
        student = await db.users.find_one({"_id": n.get("student_id")})
        n["student"] = _author(student)
    return out


@router.post("", response_model=dict)
async def add_note(body: NoteIn, staff: dict = Depends(require_staff)):
    """Lecturer/admin writes a note on a student (optionally tied to a programme)."""
    db = get_db()
    student = await db.users.find_one({"_id": body.student_id})
    if not student or student.get("role") != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")
    if body.programme_id and not await db.programmes.find_one({"_id": body.programme_id}):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not found")
    if staff.get("role") == "lecturer":
        if not body.programme_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select a programme for the note")
        if not await _owns_programme(db, staff, body.programme_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only note students of your own courses")

    now = _now()
    note = {
        "_id": uuid4().hex,
        "student_id": body.student_id,
        "programme_id": body.programme_id,
        "author_id": staff["_id"],
        "title": body.title,
        "body": body.body,
        "created_at": now,
        "updated_at": now,
    }
    await db.student_notes.insert_one(note)
    await emit("admin", "note.created", {"note_id": note["_id"], "student_id": body.student_id})
    await emit("user:{user_id}".format(user_id=body.student_id), "note.created", {"note_id": note["_id"]})
    return serialize(note)


@router.get("/student/{student_id}", response_model=Page[dict])
async def notes_for_student(
    student_id: str,
    programme_id: str | None = None,
    page: int = 1,
    size: int = 50,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    await _can_view_student(db, user, student_id)
    query: dict = {"student_id": student_id}
    if programme_id:
        query["programme_id"] = programme_id
    total = await db.student_notes.count_documents(query)
    cursor = db.student_notes.find(query).sort("created_at", -1).skip((page - 1) * size).limit(size)
    items = await _hydrate(db, await cursor.to_list(length=size))
    return Page[dict](items=items, total=total, page=page, size=size)


@router.get("/mine", response_model=Page[dict])
async def my_notes(page: int = 1, size: int = 50, user: dict = Depends(get_current_user)):
    db = get_db()
    query: dict = {"student_id": user["_id"]} if user.get("role") == "student" else {"author_id": user["_id"]}
    total = await db.student_notes.count_documents(query)
    cursor = db.student_notes.find(query).sort("created_at", -1).skip((page - 1) * size).limit(size)
    items = await _hydrate(db, await cursor.to_list(length=size))
    return Page[dict](items=items, total=total, page=page, size=size)


@router.delete("/{note_id}", response_model=MessageOut)
async def delete_note(note_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    note = await db.student_notes.find_one({"_id": note_id})
    if not note:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    if user.get("role") != "admin" and note["author_id"] != user["_id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the author or an admin can delete a note")
    await db.student_notes.delete_one({"_id": note_id})
    return MessageOut(message="Note deleted")
