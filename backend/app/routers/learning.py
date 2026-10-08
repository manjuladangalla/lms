import random
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_staff
from app.models.common import MessageOut, Page, serialize, serialize_many
from app.models.content import (
    AnswerFileIn,
    ExamIn,
    ExamStartIn,
    GradeAttemptIn,
    QuestionBulkIn,
    QuestionIn,
    SaveAnswerIn,
    SubmitAttemptIn,
)
from app.models.site import (
    CertificateIssueIn,
    CertificateRegenerateIn,
    CertificateTemplateIn,
    CertificateUpdateIn,
    VerifyOut,
)
from app.services.cache import get_cached, set_cached
from app.services.certificates import (
    PRINT_FIELD_KEYS,
    build_print_values,
    generate_certificate_pdf,
    generate_certificate_print_pdf,
    generate_qr_image,
    issue_certificate_assets,
    merge_template,
)
from app.services.grading import compute_final_grade, compute_totals, grade_question, needs_manual_grade
from app.services.progress import (
    can_access_lesson,
    has_programme_access,
    is_locked,
    lesson_schedule,
    recompute_enrolment_progress,
    staff_can_view,
)

router = APIRouter(tags=["learning"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------- Course ownership (admin / creator lecturer only) ----------------

async def _require_programme_owner(db, user: dict, programme_id: str) -> dict:
    from app.routers.content import _is_owner

    programme = await db.programmes.find_one({"_id": programme_id})
    if not programme:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not found")
    if not _is_owner(user, programme):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the admin or the lecturer who created this course can manage it")
    return programme


async def _require_exam_owner(db, user: dict, exam_id: str) -> dict:
    exam = await db.exams.find_one({"_id": exam_id})
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found")
    await _require_programme_owner(db, user, exam["programme_id"])
    return exam


async def _require_attempt_owner(db, user: dict, attempt_id: str) -> dict:
    attempt = await db.exam_attempts.find_one({"_id": attempt_id})
    if not attempt:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found")
    exam = await db.exams.find_one({"_id": attempt["exam_id"]})
    if exam:
        await _require_programme_owner(db, user, exam["programme_id"])
    return attempt


async def _owned_exam_ids(db, user: dict) -> list[str] | None:
    """Lecturer: exam ids for courses they own; admin → None (everything)."""
    if user.get("role") == "admin":
        return None
    progs = await db.programmes.find({"$or": [{"created_by": None}, {"created_by": user["_id"]}]}).to_list(500)
    if not progs:
        return []
    exams = await db.exams.find({"programme_id": {"$in": [p["_id"] for p in progs]}}).to_list(2000)
    return [e["_id"] for e in exams]


# ---------------- Progress ----------------

@router.post("/progress/complete", response_model=dict)
async def mark_lesson_complete(body: dict, user: dict = Depends(get_current_user)):
    lesson_id = body.get("lesson_id")
    programme_id = body.get("programme_id")
    db = get_db()
    lesson = await db.lessons.find_one({"_id": lesson_id})
    if not lesson:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")
    if not await can_access_lesson(db, user, lesson):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this lesson")
    if user.get("role") not in ("admin", "lecturer"):
        schedule = await lesson_schedule(db, lesson)
        if is_locked(schedule):
            opens = schedule["available_at"]
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Lesson not yet available — opens {opens.strftime('%d %b %Y %H:%M')} UTC",
            )

    existing = await db.lesson_progress.find_one({"user_id": user["_id"], "lesson_id": lesson_id})
    doc = {
        "user_id": user["_id"],
        "lesson_id": lesson_id,
        "programme_id": programme_id or lesson.get("programme_id"),
        "status": "completed",
        "completed_at": _now(),
        "updated_at": _now(),
    }
    if existing:
        await db.lesson_progress.update_one({"_id": existing["_id"]}, {"$set": doc})
    else:
        doc["_id"] = uuid4().hex
        doc["created_at"] = _now()
        await db.lesson_progress.insert_one(doc)

    enrolment = await db.enrolments.find_one({"user_id": user["_id"], "programme_id": lesson["programme_id"]})
    if enrolment:
        await recompute_enrolment_progress(db, enrolment)
        if (enrolment.get("progress_percent") or 0) >= 100:
            await try_auto_issue_certificate(db, user["_id"], lesson["programme_id"])
        return serialize(enrolment)
    return {"status": "ok"}


@router.get("/progress/programme/{pid}")
async def programme_progress(pid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.lesson_progress.find({"user_id": user["_id"], "programme_id": pid}).to_list(length=1000)
    done_ids = [d["lesson_id"] for d in docs if d.get("status") == "completed"]
    enrolment = await db.enrolments.find_one({"user_id": user["_id"], "programme_id": pid})
    return {
        "completed_lesson_ids": done_ids,
        "progress": serialize(enrolment),
    }


# ---------------- Exams (staff CRUD) ----------------

@router.get("/programmes/{pid}/exams")
async def list_programme_exams(pid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    programme = await db.programmes.find_one({"_id": pid})
    if not programme:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not found")
    staff_view = staff_can_view(user, programme)
    if not staff_view and not await has_programme_access(db, user, programme):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access")
    docs = await db.exams.find({"programme_id": pid}).sort("created_at", 1).to_list(length=100)
    out = serialize_many(docs)
    if not staff_view:
        now = _now()
        out = [
            e for e in out
            if e.get("status") == "published"
            and (not e.get("window_start") or e["window_start"] <= now)
            and (not e.get("window_end") or e["window_end"] >= now)
        ]
    for e in out:
        e["question_count"] = await db.questions.count_documents({"exam_id": e["id"]})
        if not staff_view:
            attempts = await db.exam_attempts.count_documents({"exam_id": e["id"], "user_id": user["_id"]})
            e["attempts_used"] = attempts
    return out


@router.post("/programmes/{pid}/exams", response_model=dict)
async def create_exam(pid: str, body: ExamIn, user: dict = Depends(require_staff)):
    db = get_db()
    await _require_programme_owner(db, user, pid)
    doc = body.model_dump()
    doc["_id"] = uuid4().hex
    doc["programme_id"] = pid
    doc["created_at"] = _now()
    await db.exams.insert_one(doc)
    return serialize(doc)


@router.put("/exams/{exam_id}", response_model=dict)
async def update_exam(exam_id: str, body: ExamIn, user: dict = Depends(require_staff)):
    db = get_db()
    await _require_exam_owner(db, user, exam_id)
    doc = await db.exams.find_one({"_id": exam_id})
    data = body.model_dump()
    data["updated_at"] = _now()
    await db.exams.update_one({"_id": exam_id}, {"$set": data})
    doc.update(data)
    return serialize(doc)


@router.delete("/exams/{exam_id}", response_model=MessageOut)
async def delete_exam(exam_id: str, user: dict = Depends(require_staff)):
    db = get_db()
    await _require_exam_owner(db, user, exam_id)
    await db.exams.delete_one({"_id": exam_id})
    await db.questions.delete_many({"exam_id": exam_id})
    return MessageOut(message="Exam deleted")


@router.get("/exams/{exam_id}", response_model=dict)
async def get_exam(exam_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    doc = await db.exams.find_one({"_id": exam_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found")
    programme = await db.programmes.find_one({"_id": doc.get("programme_id")})
    staff_view = staff_can_view(user, programme or {})
    out = serialize(doc)
    questions = await db.questions.find({"exam_id": exam_id}).sort("sort_order", 1).to_list(length=500)
    if staff_view:
        out["questions"] = serialize_many(questions)
    else:
        out["questions"] = [
            {k: v for k, v in serialize(q).items() if k not in ("correct_answer", "accepted_answers", "explanation")}
            for q in questions
        ]
        out["question_count"] = len(questions)
        if questions:
            out["total_marks"] = sum(float(q.get("marks", 1) or 1) for q in questions)
        # Paper-mode exams keep their configured total marks (no/auto questions)
    return out


@router.post("/exams/{exam_id}/questions", response_model=dict)
async def add_question(exam_id: str, body: QuestionIn, user: dict = Depends(require_staff)):
    db = get_db()
    await _require_exam_owner(db, user, exam_id)
    doc = body.model_dump()
    doc["_id"] = uuid4().hex
    doc["exam_id"] = exam_id
    doc["created_at"] = _now()
    await db.questions.insert_one(doc)
    return serialize(doc)


@router.post("/exams/{exam_id}/questions/bulk", response_model=dict)
async def add_questions_bulk(exam_id: str, body: QuestionBulkIn, user: dict = Depends(require_staff)):
    db = get_db()
    await _require_exam_owner(db, user, exam_id)
    docs = []
    for i, q in enumerate(body.questions):
        d = q.model_dump()
        d["_id"] = uuid4().hex
        d["exam_id"] = exam_id
        d.setdefault("sort_order", i)
        d["created_at"] = _now()
        docs.append(d)
    if docs:
        await db.questions.insert_many(docs)
    return {"inserted": len(docs)}


@router.put("/questions/{question_id}", response_model=dict)
async def update_question(question_id: str, body: QuestionIn, user: dict = Depends(require_staff)):
    db = get_db()
    doc = await db.questions.find_one({"_id": question_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")
    await _require_exam_owner(db, user, doc["exam_id"])
    data = body.model_dump()
    await db.questions.update_one({"_id": question_id}, {"$set": data})
    doc.update(data)
    return serialize(doc)


@router.delete("/questions/{question_id}", response_model=MessageOut)
async def delete_question(question_id: str, user: dict = Depends(require_staff)):
    db = get_db()
    doc = await db.questions.find_one({"_id": question_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")
    await _require_exam_owner(db, user, doc["exam_id"])
    await db.questions.delete_one({"_id": question_id})
    return MessageOut(message="Question deleted")


# ---------------- Exam attempts (student) ----------------

def _sanitize_answers_for_result(attempt: dict, questions: list[dict]) -> dict:
    out = serialize(attempt)
    qmap = {q["_id"]: q for q in questions}
    enriched = []
    for ans in out.get("answers", []):
        q = qmap.get(ans.get("question_id"))
        if q:
            ans["question"] = {k: v for k, v in serialize(q).items() if k != "_id"}
            ans["question"]["id"] = q["_id"]
        enriched.append(ans)
    out["answers"] = enriched
    return out


@router.post("/exams/{exam_id}/start", response_model=dict)
async def start_attempt(exam_id: str, body: ExamStartIn, user: dict = Depends(get_current_user)):
    db = get_db()
    exam = await db.exams.find_one({"_id": exam_id})
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found")
    programme = await db.programmes.find_one({"_id": exam.get("programme_id")})
    staff_view = staff_can_view(user, programme or {})
    if exam.get("status") != "published" and not staff_view:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Exam not available")
    now = _now()
    if exam.get("window_start") and now < exam["window_start"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Exam has not started yet")
    if exam.get("window_end") and now > exam["window_end"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Exam window has closed")

    used = await db.exam_attempts.count_documents({"exam_id": exam_id, "user_id": user["_id"]})
    if used >= int(exam.get("max_attempts") or 1) and not staff_view:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Max attempts reached")

    questions = await db.questions.find({"exam_id": exam_id}).to_list(length=500)
    paper_only = exam.get("submission_mode", "online") in ("file", "both")
    if not questions and not paper_only:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Exam has no questions")

    q_total = sum(float(q.get("marks", 1) or 1) for q in questions)
    attempt_total = float(exam.get("total_marks") or 0) if paper_only else q_total
    if not attempt_total:
        attempt_total = q_total

    attempt = {
        "_id": uuid4().hex,
        "exam_id": exam_id,
        "programme_id": exam.get("programme_id"),
        "user_id": user["_id"],
        "enrolment_id": body.enrolment_id,
        "attempt_no": used + 1,
        "started_at": now,
        "submitted_at": None,
        "answers": [],
        "answer_file_url": None,
        "status": "in_progress",
        "auto_score": 0,
        "essay_pending_count": 0,
        "manual_grade": paper_only,
        "total": attempt_total,
        "obtained": None,
        "percentage": None,
        "is_passed": None,
        "graded_by": None,
        "graded_at": None,
        "manual_feedback": None,
        "created_at": now,
    }
    await db.exam_attempts.insert_one(attempt)

    safe_questions = []
    for q in questions:
        s = serialize(q)
        s.pop("correct_answer", None)
        s.pop("accepted_answers", None)
        s.pop("explanation", None)
        safe_questions.append(s)
    if exam.get("shuffle"):
        random.shuffle(safe_questions)

    out = serialize(attempt)
    out["exam"] = serialize(exam)
    out["questions"] = safe_questions
    out["deadline"] = (now.timestamp() + int(exam.get("duration_min") or 30) * 60)
    return out


@router.put("/attempts/{attempt_id}/answer")
async def save_answer(attempt_id: str, body: SaveAnswerIn, user: dict = Depends(get_current_user)):
    db = get_db()
    attempt = await db.exam_attempts.find_one({"_id": attempt_id, "user_id": user["_id"]})
    if not attempt:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found")
    if attempt["status"] != "in_progress":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Attempt already submitted")
    answers = [a for a in attempt.get("answers", []) if a.get("question_id") != body.question_id]
    answers.append({"question_id": body.question_id, "answer": body.answer})
    await db.exam_attempts.update_one({"_id": attempt_id}, {"$set": {"answers": answers}})
    return {"saved": True}


@router.post("/attempts/{attempt_id}/answer-file", response_model=dict)
async def set_answer_file(attempt_id: str, body: AnswerFileIn, user: dict = Depends(get_current_user)):
    """Attach the uploaded answer paper (student first uploads via POST /upload)."""
    db = get_db()
    attempt = await db.exam_attempts.find_one({"_id": attempt_id, "user_id": user["_id"]})
    if not attempt:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found")
    if attempt["status"] != "in_progress":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Attempt already submitted")
    url = body.url.strip()
    if not url.startswith(("/media/", "http://", "https://")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid file URL")
    await db.exam_attempts.update_one({"_id": attempt_id}, {"$set": {"answer_file_url": url}})
    return {"saved": True, "answer_file_url": url}


@router.post("/attempts/{attempt_id}/submit")
async def submit_attempt(attempt_id: str, body: SubmitAttemptIn, user: dict = Depends(get_current_user)):
    db = get_db()
    attempt = await db.exam_attempts.find_one({"_id": attempt_id, "user_id": user["_id"]})
    if not attempt:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found")
    if attempt["status"] != "in_progress":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Attempt already submitted")

    if body.answers:
        merged = {a["question_id"]: a for a in attempt.get("answers", [])}
        for a in body.answers:
            merged[a.question_id] = {"question_id": a.question_id, "answer": a.answer}
        attempt["answers"] = list(merged.values())

    exam = await db.exams.find_one({"_id": attempt["exam_id"]})
    mode = (exam or {}).get("submission_mode", "online")
    if mode in ("file", "both") and not attempt.get("answer_file_url"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Upload your answer paper before submitting")

    questions = await db.questions.find({"exam_id": attempt["exam_id"]}).to_list(length=500)
    qmap = {q["_id"]: q for q in questions}
    graded_answers = []
    auto_score = 0.0
    pending = 0
    for ans in attempt.get("answers", []):
        q = qmap.get(ans.get("question_id"))
        if not q:
            continue
        awarded, feedback = grade_question(q, ans.get("answer"))
        if feedback == "pending":
            pending += 1
        else:
            auto_score += awarded
        graded_answers.append({
            "question_id": ans["question_id"],
            "answer": ans.get("answer"),
            "awarded_marks": awarded,
            "feedback": feedback,
        })
    totals = compute_totals({"answers": graded_answers}, questions)
    has_manual = pending > 0 or mode in ("file", "both")
    status_ = "grading" if has_manual else "graded"
    obtained = auto_score
    total_final = totals["total"] or float((exam or {}).get("total_marks") or 0)
    percentage = round((obtained / total_final) * 100, 2) if total_final else 0
    update = {
        "answers": graded_answers,
        "submitted_at": _now(),
        "status": status_,
        "auto_score": auto_score,
        "essay_pending_count": pending,
        "manual_grade": mode in ("file", "both"),
        "total": total_final,
        "obtained": obtained,
        "percentage": percentage,
        "is_passed": (not has_manual) and exam is not None and obtained >= float(exam.get("pass_marks") or 0),
    }
    await db.exam_attempts.update_one({"_id": attempt_id}, {"$set": update})
    attempt.update(update)
    questions = await db.questions.find({"exam_id": attempt["exam_id"]}).to_list(length=500)
    if attempt.get("programme_id") and attempt.get("status") in ("graded", "published"):
        await try_auto_issue_certificate(db, attempt["user_id"], attempt["programme_id"])
    return _sanitize_answers_for_result(attempt, questions)


@router.get("/attempts/mine")
async def my_attempts(user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.exam_attempts.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(length=200)
    out = serialize_many(docs)
    for a in out:
        exam = await db.exams.find_one({"_id": a["exam_id"]})
        a["exam"] = {"id": exam["_id"], "title": exam["title"], "pass_marks": exam.get("pass_marks")} if exam else None
        if a.get("programme_id"):
            prog = await db.programmes.find_one({"_id": a["programme_id"]})
            a["programme"] = {"id": prog["_id"], "title": prog["title"]} if prog else None
    return out


@router.get("/attempts/{attempt_id}")
async def get_attempt(attempt_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    attempt = await db.exam_attempts.find_one({"_id": attempt_id})
    if not attempt:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found")
    exam_for_view = await db.exams.find_one({"_id": attempt["exam_id"]})
    programme_for_view = await db.programmes.find_one({"_id": (exam_for_view or {}).get("programme_id")})
    is_staff = staff_can_view(user, programme_for_view or {})
    if not is_staff and attempt["user_id"] != user["_id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your attempt")
    questions = await db.questions.find({"exam_id": attempt["exam_id"]}).to_list(length=500)
    out = _sanitize_answers_for_result(attempt, questions)
    exam = exam_for_view
    out["exam"] = serialize(exam) if exam else None
    if not is_staff and out["status"] in ("in_progress",):
        for ans in out.get("answers", []):
            if ans.get("question"):
                ans["question"].pop("correct_answer", None)
                ans["question"].pop("accepted_answers", None)
    if out.get("user_id"):
        student = await db.users.find_one({"_id": out["user_id"]})
        out["student"] = {"id": student["_id"], "name": student["name"], "email": student["email"]} if student else None
    return out


@router.get("/attempts", response_model=Page[dict])
async def list_attempts_for_staff(
    user: dict = Depends(require_staff),
    exam_id: str | None = None,
    status_: str | None = None,
    page: int = 1,
    size: int = 20,
):
    db = get_db()
    query: dict = {}
    if status_:
        query["status"] = status_
    owned = await _owned_exam_ids(db, user)
    if owned is not None:
        if exam_id and exam_id not in owned:
            return Page[dict](items=[], total=0, page=page, size=size)
        query["exam_id"] = {"$in": owned}
    elif exam_id:
        query["exam_id"] = exam_id
    total = await db.exam_attempts.count_documents(query)
    cursor = db.exam_attempts.find(query).sort("created_at", -1).skip((page - 1) * size).limit(size)
    items = serialize_many(await cursor.to_list(length=size))
    for a in items:
        u = await db.users.find_one({"_id": a["user_id"]})
        e = await db.exams.find_one({"_id": a["exam_id"]})
        a["student"] = {"id": u["_id"], "name": u["name"], "email": u["email"]} if u else None
        a["exam"] = {"id": e["_id"], "title": e["title"]} if e else None
    return Page[dict](items=items, total=total, page=page, size=size)


@router.get("/grading/queue", response_model=Page[dict])
async def grading_queue(user: dict = Depends(require_staff), page: int = 1, size: int = 20):
    db = get_db()
    query = {
        "status": {"$in": ["grading", "submitted"]},
        "$or": [{"essay_pending_count": {"$gt": 0}}, {"manual_grade": True}],
    }
    owned = await _owned_exam_ids(db, user)
    if owned is not None:
        query["exam_id"] = {"$in": owned}
    total = await db.exam_attempts.count_documents(query)
    cursor = db.exam_attempts.find(query).sort("submitted_at", 1).skip((page - 1) * size).limit(size)
    items = serialize_many(await cursor.to_list(length=size))
    for a in items:
        u = await db.users.find_one({"_id": a["user_id"]})
        e = await db.exams.find_one({"_id": a["exam_id"]})
        a["student"] = {"id": u["_id"], "name": u["name"]} if u else None
        a["exam"] = {"id": e["_id"], "title": e["title"]} if e else None
    return Page[dict](items=items, total=total, page=page, size=size)


@router.post("/attempts/{attempt_id}/grade")
async def grade_attempt(attempt_id: str, body: GradeAttemptIn, staff: dict = Depends(require_staff)):
    db = get_db()
    attempt = await _require_attempt_owner(db, staff, attempt_id)
    exam = await db.exams.find_one({"_id": attempt["exam_id"]})
    answers = attempt.get("answers", [])

    if body.total_awarded is not None:
        # Manual paper grading: overall total marks + feedback (file/both mode)
        total = float((exam or {}).get("total_marks") or attempt.get("total") or 0) or 1
        obtained = min(float(body.total_awarded), total)
        percentage = round((obtained / total) * 100, 2)
        passed = obtained >= float((exam or {}).get("pass_marks") or 0)
        new_status = "published" if body.publish else "graded"
        update = {
            "obtained": obtained,
            "total": total,
            "percentage": percentage,
            "is_passed": passed,
            "manual_feedback": body.feedback or "",
            "essay_pending_count": 0,
            "status": new_status,
            "graded_by": staff["_id"],
            "graded_at": _now(),
        }
        await db.exam_attempts.update_one({"_id": attempt_id}, {"$set": update})
        attempt.update(update)
        questions = await db.questions.find({"exam_id": attempt["exam_id"]}).to_list(length=500)
        if attempt.get("programme_id") and new_status in ("graded", "published"):
            await try_auto_issue_certificate(db, attempt["user_id"], attempt["programme_id"])
        return _sanitize_answers_for_result(attempt, questions)

    if attempt.get("manual_grade") and not answers and body.total_awarded is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter total marks for this paper attempt")

    grade_map = {g.question_id: g for g in body.grades}
    remaining_pending = 0
    for ans in answers:
        g = grade_map.get(ans.get("question_id"))
        if g is not None:
            ans["awarded_marks"] = float(ans.get("awarded_marks") or 0) + g.awarded_marks
            ans["feedback"] = g.feedback or "Graded"
            q = await db.questions.find_one({"_id": ans["question_id"]})
            if q:
                ans["awarded_marks"] = min(g.awarded_marks, float(q.get("marks", 1) or 1))
        elif ans.get("feedback") == "pending":
            remaining_pending += 1

    obtained = sum(float(a.get("awarded_marks") or 0) for a in answers)
    exam = await db.exams.find_one({"_id": attempt["exam_id"]})
    total = float(exam.get("total_marks") or attempt.get("total") or 1)
    if not total:
        questions = await db.questions.find({"exam_id": attempt["exam_id"]}).to_list(length=500)
        total = sum(float(q.get("marks", 1) or 1) for q in questions) or 1
    percentage = round((obtained / total) * 100, 2)
    passed = obtained >= float(exam.get("pass_marks") or 0) if exam else False

    if remaining_pending > 0:
        new_status = "grading"
    elif body.publish:
        new_status = "published"
    else:
        new_status = "graded"

    update = {
        "answers": answers,
        "essay_pending_count": remaining_pending,
        "obtained": obtained,
        "total": total,
        "percentage": percentage,
        "is_passed": passed,
        "status": new_status,
        "graded_by": staff["_id"],
        "graded_at": _now(),
    }
    await db.exam_attempts.update_one({"_id": attempt_id}, {"$set": update})
    attempt.update(update)
    questions = await db.questions.find({"exam_id": attempt["exam_id"]}).to_list(length=500)
    if attempt.get("programme_id") and new_status in ("graded", "published"):
        await try_auto_issue_certificate(db, attempt["user_id"], attempt["programme_id"])
    return _sanitize_answers_for_result(attempt, questions)


@router.post("/attempts/{attempt_id}/publish", response_model=MessageOut)
async def publish_result(attempt_id: str, user: dict = Depends(require_staff)):
    db = get_db()
    await _require_attempt_owner(db, user, attempt_id)
    result = await db.exam_attempts.update_one(
        {"_id": attempt_id, "status": {"$in": ["graded", "grading"]}},
        {"$set": {"status": "published"}},
    )
    if result.matched_count == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Attempt cannot be published")
    return MessageOut(message="Result published")


# ---------------- Certificates ----------------

def _abs_verify_url(verify_path: str) -> str:
    from app.core.config import settings

    base = (settings.public_api_url or "").rstrip("/")
    return f"{base}{verify_path}" if base else verify_path


async def _get_print_template(db) -> dict:
    stored = await db.settings.find_one({"_id": "certificate_print"})
    return merge_template(stored)


async def _refresh_verify_cache(db, doc: dict) -> None:
    payload = serialize(doc)
    payload.pop("qr_token", None)
    valid = doc.get("status") != "revoked"
    await set_cached(
        f"verify:{doc['cert_no']}",
        {"valid": valid, "certificate": payload, "message": "Certificate is valid" if valid else "Certificate revoked"},
        ttl=600,
    )

async def _eligibility(db, user_id: str, programme_id: str) -> tuple[bool, str, dict | None]:
    enrolment = await db.enrolments.find_one({"user_id": user_id, "programme_id": programme_id})
    if not enrolment:
        return False, "Not enrolled", None
    if enrolment.get("progress_percent", 0) < 100:
        return False, "Programme not completed", enrolment
    programme = await db.programmes.find_one({"_id": programme_id})
    grade = await compute_final_grade(db, user_id, programme_id)
    if not grade["passed"]:
        return (
            False,
            f"Final grade {grade['final_grade']}% below pass mark {grade['pass_percent']}%",
            enrolment,
        )
    if programme and programme.get("final_exam_required"):
        final = await db.exams.find_one({"programme_id": programme_id, "type": "final"})
        if final:
            passed = await db.exam_attempts.find_one(
                {"exam_id": final["_id"], "user_id": user_id, "is_passed": True, "status": {"$in": ["graded", "published"]}}
            )
            if not passed:
                return False, "Final exam not passed", enrolment
    existing = await db.certificates.find_one({"user_id": user_id, "programme_id": programme_id})
    return True, "Eligible", existing or enrolment


async def _issue_certificate_for(db, user_id: str, programme_id: str, issued_by: str) -> dict:
    """Shared issuance used by admin endpoint and auto-issue."""
    existing = await db.certificates.find_one({"user_id": user_id, "programme_id": programme_id})
    if existing:
        return serialize(existing)
    eligible, reason, enrolment = await _eligibility(db, user_id, programme_id)
    if not eligible:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, reason)

    student = await db.users.find_one({"_id": user_id})
    programme = await db.programmes.find_one({"_id": programme_id})
    if not student or not programme:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student or programme not found")

    seq = await db.certificates.count_documents({}) + 1
    cert_no = f"LMS-{datetime.now().year}-{seq:06d}"
    settings_doc = await db.settings.find_one({"_id": "institute"}) or {}
    institute_name = settings_doc.get("site_name", "LMS Institute")
    issuer = settings_doc.get("certificate_issuer") or institute_name
    verify_url = f"/verify/{cert_no}"
    completion = (enrolment or {}).get("completed_at") or _now()
    grade = await compute_final_grade(db, user_id, programme_id)

    doc = {
        "_id": uuid4().hex,
        "cert_no": cert_no,
        "qr_token": uuid4().hex,
        "user_id": user_id,
        "programme_id": programme_id,
        "student_name": student["name"],
        "programme_name": programme["title"],
        "programme_type": programme.get("type"),
        "completion_date": completion,
        "final_grade": grade["final_grade"],
        "pass_percent": grade["pass_percent"],
        "status": "issued",
        "pdf_url": None,
        "qr_url": None,
        "verify_url": verify_url,
        "issued_by": issued_by,
        "issued_at": _now(),
    }

    doc["verify_url"] = verify_url
    doc["print_values"] = {}
    doc["print_pdf_url"] = None

    abs_verify = _abs_verify_url(verify_url)
    try:
        values = build_print_values(doc, institute_name, issuer)
        template = await _get_print_template(db)
        qr_png = generate_qr_image(abs_verify)
        system_pdf = generate_certificate_pdf(
            cert_no=cert_no,
            student_name=values["student_name"],
            programme_name=values["programme_name"],
            institute_name=institute_name,
            completion_date=completion,
            verify_url=abs_verify,
            issuer=issuer,
            final_grade=grade["final_grade"],
            qr_image=qr_png,
        )
        print_pdf = generate_certificate_print_pdf(
            values=values, template=template, qr_image=qr_png, verify_url=abs_verify
        )
        assets = await issue_certificate_assets(system_pdf, print_pdf, qr_png)
        doc["qr_url"] = assets["qr_url"] or None
        doc["pdf_url"] = assets["pdf_url"] or None
        doc["print_pdf_url"] = assets["print_pdf_url"] or None
    except Exception as exc:  # noqa: BLE001 — issuance must never fail on storage/PDF errors
        print(f"[cert] asset generation failed for {cert_no}: {exc}")

    await db.certificates.insert_one(doc)
    if enrolment and not enrolment.get("certificate_id"):
        await db.enrolments.update_one({"_id": enrolment["_id"]}, {"$set": {"certificate_id": doc["_id"]}})
    await set_cached(f"verify:{cert_no}", {"valid": True, "certificate": serialize(doc), "message": "Valid certificate"}, ttl=600)
    print(f"[cert] issued {cert_no} student={student['email']} grade={grade['final_grade']}% ({'auto' if issued_by == 'system' else 'manual'})")
    return serialize(doc)


async def try_auto_issue_certificate(db, user_id: str, programme_id: str) -> dict | None:
    """Auto-issue when eligible. Returns cert dict or None. Never raises for eligibility."""
    existing = await db.certificates.find_one({"user_id": user_id, "programme_id": programme_id})
    if existing:
        return None
    try:
        eligible, _, _ = await _eligibility(db, user_id, programme_id)
    except Exception as exc:  # noqa: BLE001
        print(f"[cert-auto] eligibility error: {exc}")
        return None
    if not eligible:
        return None
    try:
        return await _issue_certificate_for(db, user_id, programme_id, issued_by="system")
    except Exception as exc:  # noqa: BLE001
        print(f"[cert-auto] issue error: {exc}")
        return None


@router.get("/certificates/eligibility/{programme_id}")
async def check_eligibility(programme_id: str, user_id: str | None = None, user: dict = Depends(get_current_user)):
    """Check eligibility for self — staff may pass ?user_id= to check a student."""
    db = get_db()
    programme = await db.programmes.find_one({"_id": programme_id})
    is_staff = staff_can_view(user, programme or {})
    target_id = user["_id"]
    if user_id:
        if not is_staff and user_id != user["_id"]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your account")
        target_id = user_id
    eligible, reason, _ = await _eligibility(db, target_id, programme_id)
    grade = await compute_final_grade(db, target_id, programme_id)
    return {"eligible": eligible, "reason": reason, "final_grade": grade}


@router.get("/certificates/mine")
async def my_certificates(user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.certificates.find({"user_id": user["_id"]}).sort("issued_at", -1).to_list(length=100)
    return serialize_many(docs)


@router.get("/certificates", response_model=Page[dict])
async def admin_list_certificates(user: dict = Depends(require_staff), page: int = 1, size: int = 20, q: str | None = None):
    db = get_db()
    query: dict = {}
    if user.get("role") != "admin":
        # Lecturers only see certificates from their own courses
        progs = await db.programmes.find({"$or": [{"created_by": None}, {"created_by": user["_id"]}]}).to_list(500)
        query["programme_id"] = {"$in": [p["_id"] for p in progs]}
    if q:
        query["$or"] = [
            {"cert_no": {"$regex": q, "$options": "i"}},
            {"student_name": {"$regex": q, "$options": "i"}},
            {"programme_name": {"$regex": q, "$options": "i"}},
        ]
    total = await db.certificates.count_documents(query)
    cursor = db.certificates.find(query).sort("issued_at", -1).skip((page - 1) * size).limit(size)
    return Page[dict](items=serialize_many(await cursor.to_list(length=size)), total=total, page=page, size=size)


@router.post("/certificates", response_model=dict)
async def issue_certificate(body: CertificateIssueIn, staff: dict = Depends(require_staff)):
    db = get_db()
    await _require_programme_owner(db, staff, body.programme_id)
    return await _issue_certificate_for(db, body.user_id, body.programme_id, issued_by=staff["_id"])


@router.post("/certificates/{cert_id}/revoke", response_model=MessageOut)
async def revoke_certificate(cert_id: str, user: dict = Depends(require_staff)):
    db = get_db()
    doc = await db.certificates.find_one({"_id": cert_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    if doc.get("programme_id"):
        await _require_programme_owner(db, user, doc["programme_id"])
    elif user.get("role") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the admin can manage this certificate")
    await db.certificates.update_one({"_id": cert_id}, {"$set": {"status": "revoked"}})
    await set_cached(f"verify:{doc['cert_no']}", {"valid": False, "certificate": serialize(doc), "message": "Certificate revoked"}, ttl=600)
    return MessageOut(message="Certificate revoked")


# --- Print template (positions for pre-printed certificates) ---

@router.get("/certificates/template", response_model=dict)
async def get_certificate_template(_: dict = Depends(require_staff)):
    db = get_db()
    return await _get_print_template(db)


@router.put("/certificates/template", response_model=dict)
async def save_certificate_template(body: CertificateTemplateIn, _: dict = Depends(require_admin)):
    """Admin-only: positions are institute-wide (physical pre-printed paper)."""
    db = get_db()
    clean: dict = {"fields": {}}
    if body.page:
        clean["page"] = {
            "width": float(body.page.get("width") or 792),
            "height": float(body.page.get("height") or 612),
        }
    for key, f in body.fields.items():
        clean["fields"][key] = {
            k: v for k, v in {"x": f.x, "y": f.y, "size": f.size, "align": f.align, "visible": f.visible}.items()
            if v is not None
        }
    # Merge partial field updates into stored positions; empty fields map resets to defaults
    existing = await db.settings.find_one({"_id": "certificate_print"}) or {}
    if body.fields:
        merged_fields = dict(existing.get("fields") or {})
        for key, vals in clean["fields"].items():
            merged_fields[key] = {**merged_fields.get(key, {}), **vals}
        clean["fields"] = merged_fields
    else:
        clean["fields"] = {}
    await db.settings.update_one(
        {"_id": "certificate_print"},
        {"$set": clean, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
    return merge_template(clean)


@router.put("/certificates/{cert_id}", response_model=dict)
async def update_certificate_values(cert_id: str, body: CertificateUpdateIn, user: dict = Depends(require_staff)):
    """Edit the values printed on the pre-printed certificate (blank clears an override)."""
    db = get_db()
    doc = await db.certificates.find_one({"_id": cert_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    if doc.get("programme_id"):
        await _require_programme_owner(db, user, doc["programme_id"])
    elif user.get("role") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the admin can manage this certificate")
    merged = dict(doc.get("print_values") or {})
    for key, value in (body.print_values or {}).items():
        if key not in PRINT_FIELD_KEYS:
            continue
        text = (value or "").strip()
        if text:
            merged[key] = text
        else:
            merged.pop(key, None)
    await db.certificates.update_one({"_id": cert_id}, {"$set": {"print_values": merged}})
    doc.update({"print_values": merged})
    await _refresh_verify_cache(db, doc)
    return serialize(doc)


@router.post("/certificates/{cert_id}/regenerate", response_model=dict)
async def regenerate_certificate(
    cert_id: str,
    body: CertificateRegenerateIn,
    user: dict = Depends(get_current_user),
):
    """Re-render PDF(s) after editing values or moving template fields."""
    from app.services.storage import upload_bytes

    db = get_db()
    doc = await db.certificates.find_one({"_id": cert_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    if doc.get("user_id") != user["_id"]:
        # Staff can only regenerate certificates from courses they own
        if doc.get("programme_id"):
            await _require_programme_owner(db, user, doc["programme_id"])
        elif user.get("role") != "admin":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your certificate")

    settings_doc = await db.settings.find_one({"_id": "institute"}) or {}
    institute_name = settings_doc.get("site_name", "LMS Institute")
    issuer = settings_doc.get("certificate_issuer") or institute_name
    verify_path = doc.get("verify_url") or f"/verify/{doc.get('cert_no')}"
    abs_verify = _abs_verify_url(verify_path)

    update: dict = {}
    try:
        values = build_print_values(doc, institute_name, issuer)
        qr_png = generate_qr_image(abs_verify)
        if body.mode in ("all", "system"):
            system_pdf = generate_certificate_pdf(
                cert_no=doc.get("cert_no") or "",
                student_name=values["student_name"],
                programme_name=values["programme_name"],
                institute_name=institute_name,
                completion_date=doc.get("completion_date"),
                verify_url=abs_verify,
                issuer=issuer,
                final_grade=doc.get("final_grade"),
                qr_image=qr_png,
            )
            url = await upload_bytes(system_pdf, "certificates/pdf", "application/pdf")
            if url:
                update["pdf_url"] = url
        if body.mode in ("all", "print"):
            template = await _get_print_template(db)
            print_pdf = generate_certificate_print_pdf(
                values=values, template=template, qr_image=qr_png, verify_url=abs_verify
            )
            url = await upload_bytes(print_pdf, "certificates/print", "application/pdf")
            if url:
                update["print_pdf_url"] = url
        if body.mode == "all":
            url = await upload_bytes(qr_png, "certificates/qr", "image/png")
            if url:
                update["qr_url"] = url
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Regeneration failed: {exc}") from exc

    if update:
        await db.certificates.update_one({"_id": cert_id}, {"$set": update})
        doc.update(update)
        await _refresh_verify_cache(db, doc)
    return serialize(doc)


@router.get("/verify/{cert_no}", response_model=VerifyOut)
async def verify_certificate(cert_no: str):
    cache_key = f"verify:{cert_no}"
    cached = await get_cached(cache_key)
    if cached:
        return cached
    db = get_db()
    doc = await db.certificates.find_one({"cert_no": cert_no.upper()})
    if not doc:
        result = VerifyOut(valid=False, certificate=None, message="Certificate not found")
    elif doc.get("status") == "revoked":
        result = VerifyOut(valid=False, certificate=serialize(doc), message="Certificate has been revoked")
    else:
        cert = serialize(doc)
        cert.pop("qr_token", None)
        result = VerifyOut(valid=True, certificate=cert, message="Certificate is valid")
    await set_cached(cache_key, result.model_dump(), ttl=600)
    return result
