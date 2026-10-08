from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings

client: AsyncIOMotorClient | None = None
db: AsyncIOMotorDatabase | None = None


async def connect_db() -> None:
    global client, db
    client = AsyncIOMotorClient(settings.mongo_url)
    db = client[settings.mongo_db]
    await _ensure_indexes()


async def close_db() -> None:
    global client, db
    if client:
        client.close()
    client = None
    db = None


def get_db() -> AsyncIOMotorDatabase:
    if db is None:
        raise RuntimeError("Database is not initialized")
    return db


async def _ensure_indexes() -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("google_id")
    await db.programmes.create_index("slug", unique=True)
    await db.subjects.create_index("programme_id")
    await db.lessons.create_index("subject_id")
    await db.lessons.create_index("programme_id")
    await db.materials.create_index("programme_id")
    # Enrolments: one per (user, programme, scope) — full/module/lesson purchases coexist.
    await db.enrolments.update_many(
        {"scope_key": {"$exists": False}}, {"$set": {"scope_key": "programme"}}
    )
    try:
        await db.enrolments.drop_index("user_id_1_programme_id_1")
    except Exception:
        pass
    await db.enrolments.create_index(
        [("user_id", 1), ("programme_id", 1), ("scope_key", 1)], unique=True
    )
    await db.enrolments.create_index("status")
    await db.memberships.create_index("user_id")
    await db.memberships.create_index("status")
    await db.payments.create_index("status")
    await db.payments.create_index("user_id")
    await db.lesson_progress.create_index([("user_id", 1), ("lesson_id", 1)], unique=True)
    await db.lesson_progress.create_index("programme_id")
    await db.exams.create_index("programme_id")
    await db.questions.create_index("exam_id")
    await db.exam_attempts.create_index([("exam_id", 1), ("user_id", 1), ("attempt_no", 1)])
    await db.exam_attempts.create_index("status")
    await db.certificates.create_index("cert_no", unique=True)
    await db.certificates.create_index([("user_id", 1), ("programme_id", 1)])
    await db.contact_messages.create_index("created_at")
    await db.audit_logs.create_index("created_at")
    await db.live_sessions.create_index([("programme_id", 1), ("start_time", 1)])
    await db.live_sessions.create_index("start_time")
    await db.assignments.create_index([("programme_id", 1), ("subject_id", 1)])
    await db.assignment_submissions.create_index([("assignment_id", 1), ("user_id", 1)], unique=True)
    await db.assignment_submissions.create_index("programme_id")
