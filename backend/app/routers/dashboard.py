from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_staff
from app.models.common import serialize

router = APIRouter(tags=["dashboard"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/dashboard/student")
async def student_dashboard(user: dict = Depends(get_current_user)):
    db = get_db()
    enrolments = await db.enrolments.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(length=100)
    for e in enrolments:
        prog = await db.programmes.find_one({"_id": e["programme_id"]})
        e["programme"] = serialize(prog) if prog else None

    memberships = await db.memberships.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(length=20)
    active_membership = None
    for m in memberships:
        if m.get("status") == "active" and m.get("expires_at") and m["expires_at"] > _now():
            active_membership = serialize(m)
            plan = await db.membership_plans.find_one({"_id": m["plan_id"]})
            active_membership["plan"] = serialize(plan) if plan else None
            break

    payments = await db.payments.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(length=20)
    attempts = await db.exam_attempts.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(length=20)
    for a in attempts:
        exam = await db.exams.find_one({"_id": a["exam_id"]})
        a["exam"] = serialize(exam) if exam else None
    certificates = await db.certificates.find({"user_id": user["_id"]}).to_list(length=50)
    pending_payments = [p for p in payments if p.get("status") in ("awaiting_verification", "pending")]

    active = [e for e in enrolments if e.get("status") == "active"]
    completed = [e for e in enrolments if e.get("progress_percent", 0) >= 100]
    avg_progress = int(round(sum(e.get("progress_percent", 0) for e in active) / len(active))) if active else 0

    return {
        "stats": {
            "enrolled": len(enrolments),
            "active": len(active),
            "completed": len(completed),
            "certificates": len(certificates),
            "exams_taken": len([a for a in attempts if a.get("status") in ("graded", "published")]),
            "avg_progress": avg_progress,
            "pending_payments": len(pending_payments),
        },
        "enrolments": [serialize(e) for e in enrolments],
        "membership": active_membership,
        "payments": [serialize(p) for p in payments[:10]],
        "recent_attempts": [serialize(a) for a in attempts[:10]],
        "certificates": [serialize(c) for c in certificates],
    }


@router.get("/dashboard/staff")
async def staff_dashboard(user: dict = Depends(require_staff)):
    """Lecturer-facing stats (content centric — scoped to their own courses; admin sees all)."""
    db = get_db()
    now = _now()

    is_admin = user.get("role") == "admin"
    prog_query: dict = {} if is_admin else {"$or": [{"created_by": None}, {"created_by": user["_id"]}]}
    owned_programmes = await db.programmes.find(prog_query).to_list(length=1000)
    pids = [p["_id"] for p in owned_programmes]
    owned_exams = await db.exams.find({"programme_id": {"$in": pids}}).to_list(length=2000)
    exam_ids = [e["_id"] for e in owned_exams]
    owned_assignments = await db.assignments.find({"programme_id": {"$in": pids}}).to_list(length=2000)

    total_programmes = len(owned_programmes)
    published = len([p for p in owned_programmes if p.get("status") == "published"])
    total_students = await db.users.count_documents({"role": "student"})
    total_lessons = await db.lessons.count_documents({"programme_id": {"$in": pids}})
    grading_queue = await db.exam_attempts.count_documents({
        "exam_id": {"$in": exam_ids},
        "status": {"$in": ["grading", "submitted"]},
        "$or": [{"essay_pending_count": {"$gt": 0}}, {"manual_grade": True}],
    })
    pending_submissions = await db.assignment_submissions.count_documents({
        "assignment_id": {"$in": [a["_id"] for a in owned_assignments]},
        "status": "submitted",
    })
    upcoming_sessions = await db.live_sessions.count_documents(
        {"programme_id": {"$in": pids}, "start_time": {"$gte": now}, "status": {"$in": ["scheduled", "live"]}}
    )
    certificates = await db.certificates.count_documents({"programme_id": {"$in": pids}})

    recent_programmes = sorted(owned_programmes, key=lambda p: p.get("updated_at") or p.get("created_at") or now, reverse=True)[:8]
    for p in recent_programmes:
        p["student_count"] = await db.enrolments.count_documents(
            {"programme_id": p["_id"], "status": "active"}
        )
        p["exam_count"] = await db.exams.count_documents({"programme_id": p["_id"]})

    from app.models.common import serialize_many

    return {
        "stats": {
            "total_programmes": total_programmes,
            "published_programmes": published,
            "total_students": total_students,
            "total_lessons": total_lessons,
            "grading_queue": grading_queue,
            "pending_submissions": pending_submissions,
            "upcoming_sessions": upcoming_sessions,
            "certificates": certificates,
        },
        "recent_programmes": serialize_many(recent_programmes),
    }


@router.get("/dashboard/admin")
async def admin_dashboard(_: dict = Depends(require_admin)):
    db = get_db()
    since = _now() - timedelta(days=30)

    total_users = await db.users.count_documents({})
    total_students = await db.users.count_documents({"role": "student"})
    total_programmes = await db.programmes.count_documents({})
    published = await db.programmes.count_documents({"status": "published"})
    total_enrolments = await db.enrolments.count_documents({})
    active_enrolments = await db.enrolments.count_documents({"status": "active"})
    pending_verifications = await db.payments.count_documents({"status": "awaiting_verification"})
    grading_queue = await db.exam_attempts.count_documents({
        "status": {"$in": ["grading", "submitted"]},
        "$or": [{"essay_pending_count": {"$gt": 0}}, {"manual_grade": True}],
    })
    new_messages = await db.contact_messages.count_documents({"status": "new"})
    certificates = await db.certificates.count_documents({})

    pipeline = [
        {"$match": {"status": "succeeded", "created_at": {"$gte": since}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    agg = await db.payments.aggregate(pipeline).to_list(length=1)
    revenue_30d = float(agg[0]["total"]) if agg else 0.0
    payments_30d = int(agg[0]["count"]) if agg else 0

    all_succeeded = await db.payments.aggregate([
        {"$match": {"status": "succeeded"}},
        {"$group": {"_id": "$currency", "total": {"$sum": "$amount"}}},
    ]).to_list(length=10)
    revenue_by_currency = {r["_id"] or "USD": float(r["total"]) for r in all_succeeded}

    recent_payments = await db.payments.find().sort("created_at", -1).limit(8).to_list(length=8)
    for p in recent_payments:
        u = await db.users.find_one({"_id": p["user_id"]})
        p["user"] = {"name": u["name"], "email": u["email"]} if u else None

    enrol_by_day = await db.enrolments.aggregate([
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]).to_list(length=60)

    from app.models.common import serialize_many

    return {
        "stats": {
            "total_users": total_users,
            "total_students": total_students,
            "total_programmes": total_programmes,
            "published_programmes": published,
            "total_enrolments": total_enrolments,
            "active_enrolments": active_enrolments,
            "pending_verifications": pending_verifications,
            "grading_queue": grading_queue,
            "new_messages": new_messages,
            "certificates": certificates,
            "revenue_30d": revenue_30d,
            "payments_30d": payments_30d,
            "revenue_by_currency": revenue_by_currency,
        },
        "enrolment_trend": [{"date": d["_id"], "count": d["count"]} for d in enrol_by_day],
        "recent_payments": serialize_many(recent_payments),
    }
