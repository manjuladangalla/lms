"""Seed default institute settings, admin user, demo content."""
import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from pymongo import UpdateOne

from app.core.config import settings
from app.core.database import connect_db, get_db, close_db
from app.core.security import hash_password
from app.routers.site import DEFAULT_SETTINGS

DEMO_INTRO_VIDEO = "https://www.youtube.com/watch?v=ScMzIvxBSi4"

PROGRAMME_SAMPLES = [
    {
        "type": "class",
        "title": "School English Support (Grade 6 to 11)",
        "slug": "school-english-support-grade-6-11",
        "summary": "Curriculum-aligned English support for Grades 6-11: grammar, comprehension, writing and exam preparation.",
        "category": "English",
        "level": "Grades 6-11",
        "duration": "Per school term",
        "price": 49,
        "cover_image_url": "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=450&fit=crop",
        "learn_outcomes": ["Strong grammar foundation", "Confident reading & comprehension", "Clear writing for school exams"],
        "modules": [
            ("Grammar & Sentences", ["Parts of speech in context", "Building clear sentences", "Common mistakes clinic"]),
            ("Reading & Comprehension", ["Skimming & scanning", "Answering comprehension questions", "Vocabulary in passages"]),
            ("Writing for Exams", ["Paragraph writing", "Essays & letters", "Exam writing practice"]),
        ],
    },
    {
        "type": "class",
        "title": "Spoken English For Everyone",
        "slug": "spoken-english-for-everyone",
        "summary": "Build confidence speaking English - conversation practice, pronunciation and real-life situations for all levels.",
        "category": "English",
        "level": "Beginner friendly",
        "duration": "8 weeks",
        "price": 29,
        "cover_image_url": "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=450&fit=crop",
        "learn_outcomes": ["Everyday conversation confidence", "Clearer pronunciation", "Fluent speaking in real situations"],
        "modules": [
            ("Everyday Conversations", ["Greetings & small talk", "Asking & answering questions", "Role plays: shop, clinic, travel"]),
            ("Pronunciation & Fluency", ["Sounds that matter", "Word stress & linking", "Shadowing practice"]),
            ("Speaking with Confidence", ["Expressing opinions", "Phone & video calls", "Group discussion skills"]),
        ],
    },
    {
        "type": "diploma",
        "title": "English For Professionals",
        "slug": "english-for-professionals",
        "summary": "Diploma-level professional English: workplace communication, presentations, report writing and interview skills.",
        "category": "English",
        "level": "Professional",
        "duration": "4 months",
        "price": 199,
        "cover_image_url": "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=450&fit=crop",
        "learn_outcomes": ["Professional emails & meetings", "Confident presentations", "Interview-ready written & spoken English"],
        "modules": [
            ("Workplace Communication", ["Emails that get results", "Meetings & minutes", "Networking conversations"]),
            ("Presentations & Reports", ["Structuring a presentation", "Handling Q&A", "Report & proposal writing"]),
            ("Career English", ["CV & cover letters", "Interview skills", "Client & stakeholder English"]),
        ],
    },
]


def _programme_doc(s: dict, i: int, now) -> dict:
    return {
        "type": s["type"],
        "title": s["title"],
        "slug": s["slug"],
        "summary": s["summary"],
        "description": s["summary"],
        "cover_image_url": s["cover_image_url"],
        "intro_video_url": DEMO_INTRO_VIDEO,
        "category": s["category"],
        "level": s["level"],
        "duration": s["duration"],
        "price": s["price"],
        "currency": settings.default_currency,
        "is_free": False,
        "status": "published",
        "instructor_ids": [],
        "prerequisites": [],
        "learn_outcomes": s["learn_outcomes"],
        "sort_order": i,
        "final_exam_required": s["type"] == "diploma",
        "pricing_mode": "once",
        "billing_interval": "monthly",
        "assignment_weight": 40,
        "exam_weight": 60,
        "pass_percent": 50,
        "created_at": now,
        "updated_at": now,
    }


async def _seed_programme_modules(db, pid: str, modules: list, now) -> None:
    for si, (mod_title, lessons) in enumerate(modules):
        sid = uuid4().hex
        await db.subjects.insert_one({
            "_id": sid, "programme_id": pid, "title": mod_title,
            "description": f"{mod_title} — core lessons.", "sort_order": si,
            "is_free_preview": si == 0, "created_at": now,
        })
        for li, lt in enumerate(lessons, start=1):
            await db.lessons.insert_one({
                "_id": uuid4().hex, "programme_id": pid, "subject_id": sid,
                "title": lt, "content": f"{lt} — lesson content goes here.",
                "video_url": None, "duration_min": 20, "sort_order": li,
                "is_free_preview": li == 1 and si == 0, "status": "published", "created_at": now,
            })


async def _delete_all_programmes(db) -> int:
    """Remove every programme plus its subjects/lessons/exams/enrolments/etc."""
    doomed = [d["_id"] for d in await db.programmes.find({}, {"_id": 1}).to_list(length=10000)]
    if not doomed:
        return 0
    exam_ids = [
        e["_id"] for e in await db.exams.find({"programme_id": {"$in": doomed}}, {"_id": 1}).to_list(length=10000)
    ]
    if exam_ids:
        await db.questions.delete_many({"exam_id": {"$in": exam_ids}})
        await db.exam_attempts.delete_many({"exam_id": {"$in": exam_ids}})
        await db.exams.delete_many({"_id": {"$in": exam_ids}})
    for coll in (
        "subjects", "lessons", "materials", "assignments", "assignment_submissions",
        "live_sessions", "enrolments", "certificates", "lesson_progress",
    ):
        await db[coll].delete_many({"programme_id": {"$in": doomed}})
    await db.programmes.delete_many({"_id": {"$in": doomed}})
    print(f"Removed {len(doomed)} old programme(s) and their content")
    return len(doomed)


async def _install_programme_samples(db, now) -> None:
    for i, s in enumerate(PROGRAMME_SAMPLES):
        pid = uuid4().hex
        await db.programmes.insert_one({"_id": pid, **_programme_doc(s, i, now)})
        await _seed_programme_modules(db, pid, s["modules"], now)
        print(f"Created programme: {s['title']} ({s['type']})")
    print("Seeded programmes (English: school support, spoken English, professional diploma)")


async def ensure_programmes(db, now) -> None:
    """Empty site, or site still holding only old demo programmes -> install the three English programmes.
    Runs automatically on API startup; never touches the site once they exist."""
    slugs = [s["slug"] for s in PROGRAMME_SAMPLES]
    present = await db.programmes.count_documents({"slug": {"$in": slugs}})
    total = await db.programmes.count_documents({})
    if total == 0 or present == 0:
        await _delete_all_programmes(db)
        await _install_programme_samples(db, now)
    else:
        for s in PROGRAMME_SAMPLES:
            doc = await db.programmes.find_one({"slug": s["slug"]})
            if doc and await db.subjects.count_documents({"programme_id": doc["_id"]}) == 0:
                await _seed_programme_modules(db, doc["_id"], s["modules"], now)


async def seed_db(db) -> None:
    now = datetime.now(timezone.utc)

    await db.settings.update_one(
        {"_id": "institute"},
        {"$setOnInsert": {**DEFAULT_SETTINGS, "created_at": now}},
        upsert=True,
    )

    admin_email = "admin@example.com"
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "_id": uuid4().hex,
            "name": "Administrator",
            "email": admin_email,
            "password_hash": hash_password("Admin@123"),
            "phone": None,
            "role": "admin",
            "status": "active",
            "theme": "normal",
            "avatar_url": None,
            "google_id": None,
            "email_verified": True,
            "created_at": now,
            "updated_at": now,
        })
        print(f"Created admin: {admin_email} / Admin@123")

    lecturer_email = "lecturer@example.com"
    if not await db.users.find_one({"email": lecturer_email}):
        await db.users.insert_one({
            "_id": uuid4().hex,
            "name": "Demo Lecturer",
            "email": lecturer_email,
            "password_hash": hash_password("Lecturer@123"),
            "phone": None,
            "role": "lecturer",
            "status": "active",
            "theme": "normal",
            "avatar_url": None,
            "google_id": None,
            "email_verified": True,
            "created_at": now,
            "updated_at": now,
        })
        print(f"Created lecturer: {lecturer_email} / Lecturer@123")

    await ensure_programmes(db, now)

    # Membership plans: 4 discount tiers (stacked on course fees at checkout)
    legacy_plans = await db.membership_plans.count_documents({"discount_percent": {"$exists": False}})
    if legacy_plans:
        await db.membership_plans.delete_many({"discount_percent": {"$exists": False}})
        print("Removed legacy membership plan(s)")
    if await db.membership_plans.count_documents({}) == 0:
        plans = [
            ("Basic — 25% Off", 25, 5, 50, ["25% off all course fees", "Monthly or yearly billing"]),
            ("Standard — 50% Off", 50, 9, 90, ["50% off all course fees", "Monthly or yearly billing"]),
            ("Premium — 75% Off", 75, 14, 140, ["75% off all course fees", "Monthly or yearly billing"]),
            ("VIP — 100% Off", 100, 19, 190, ["100% off all course fees — every course free", "Monthly or yearly billing"]),
        ]
        for i, (name, pct, m_price, y_price, benefits) in enumerate(plans):
            await db.membership_plans.insert_one({
                "_id": uuid4().hex, "name": name,
                "description": f"Save {pct}% on every course when you buy.",
                "discount_percent": pct,
                "price": m_price, "yearly_price": y_price,
                "currency": settings.default_currency,
                "duration_days": 30, "benefits": benefits,
                "status": "active", "sort_order": i, "created_at": now,
            })
        print("Seeded 4 membership discount plans")

    # Colourful home hero banners
    if await db.banners.count_documents({}) == 0:
        banners = [
            {"title": "Learn Without Limits", "subtitle": "Classes, courses and diplomas taught by expert lecturers — earn verified certificates.",
             "cta_text": "Browse Programmes", "link_url": "/catalog", "theme": "ocean", "sort_order": 0},
            {"title": "Up to 75% Off With Membership", "subtitle": "Subscribe to a discount plan and save on every course you buy.",
             "cta_text": "View Plans", "link_url": "/memberships", "theme": "sunset", "sort_order": 1},
            {"title": "Live Classes Every Week", "subtitle": "Join real-time Zoom sessions, ask questions and learn together.",
             "cta_text": "Explore Courses", "link_url": "/catalog", "theme": "violet", "sort_order": 2},
        ]
        for b in banners:
            b["_id"] = uuid4().hex
            b["image_url"] = None
            b["active"] = True
            b["created_at"] = now
            b["updated_at"] = now
            await db.banners.insert_one(b)
        print("Seeded home banners")

    # Demo promo code (all courses, 25% off, 30 days)
    if await db.promos.count_documents({}) == 0:
        from datetime import timedelta

        await db.promos.insert_one({
            "_id": uuid4().hex, "code": "WELCOME25", "discount_percent": 25,
            "scope": "all", "programme_id": None,
            "starts_at": now, "ends_at": now + timedelta(days=30),
            "max_uses": None, "used_count": 0, "status": "active",
            "created_by": None, "created_at": now,
        })
        print("Seeded promo code WELCOME25 (25% off, all courses, 30 days)")

    # Counsellor account (counselling user level) + demo sessions
    counsellor_email = "counsellor@example.com"
    if not await db.users.find_one({"email": counsellor_email}):
        await db.users.insert_one({
            "_id": uuid4().hex,
            "name": "Demo Counsellor",
            "email": counsellor_email,
            "password_hash": hash_password("Counsellor@123"),
            "phone": None,
            "role": "counselor",
            "specialty": "Academic stress, exam anxiety & career guidance",
            "bio": "Registered counsellor working with students, parents and adults - confidential support online or at the centre.",
            "status": "active",
            "theme": "normal",
            "avatar_url": None,
            "google_id": None,
            "email_verified": True,
            "created_at": now,
            "updated_at": now,
        })
        print(f"Created counsellor: {counsellor_email} / Counsellor@123")

    # Weekly availability - the counsellor's standing sessions (doctor-style booking)
    legacy = await db.counselling_schedules.find({"weekdays": {"$exists": False}}).to_list(length=1000)
    if legacy:
        groups: dict[tuple, dict] = {}
        for s in legacy:
            key = (
                s.get("counsellor_id"), s.get("title"), s.get("start_time"), s.get("end_time"),
                s.get("slot_minutes"), s.get("mode"), s.get("capacity"), s.get("price"),
                s.get("location"), s.get("status"),
            )
            group = groups.setdefault(key, {"keep": s, "days": set(), "drop": []})
            group["days"].add(int(s.get("weekday") or 0))
            group["drop"].append(s["_id"])
        for group in groups.values():
            keep = group["keep"]
            await db.counselling_schedules.update_one(
                {"_id": keep["_id"]},
                {"$set": {"weekdays": sorted(group["days"])}, "$unset": {"weekday": ""}},
            )
            drop_ids = [i for i in group["drop"] if i != keep["_id"]]
            if drop_ids:
                await db.counselling_bookings.update_many(
                    {"schedule_id": {"$in": drop_ids}}, {"$set": {"schedule_id": keep["_id"]}}
                )
                await db.counselling_schedules.delete_many({"_id": {"$in": drop_ids}})
        print(f"Merged {len(legacy)} single-day schedules into multi-day weekly rules")

    if await db.counselling_schedules.count_documents({}) == 0:
        counsellor = await db.users.find_one({"email": counsellor_email})
        if not counsellor:
            counsellor = await db.users.find_one({"role": "counselor"})
        venue = "Homagama Centre, Godagama"
        rules = [
            ("Morning one-to-one", "Confidential one-to-one support before classes - exams, stress, study plans.",
             [0, 1, 2, 3, 4], 9, 13, 30, "both", 1, 0.0),
            ("Afternoon Zoom consultations", "Private online sessions for students, parents and adults.",
             [0, 1, 2, 3, 4], 14, 17, 30, "online", 1, 0.0),
            ("Saturday wellbeing clinic", "Longer weekend sessions - anxiety, relationships and big decisions.",
             [5], 10, 13, 60, "both", 1, 0.0),
        ]
        for title, desc, days, start_h, end_h, slot, mode, capacity, price in rules:
            await db.counselling_schedules.insert_one({
                "_id": uuid4().hex,
                "title": title,
                "description": desc,
                "weekdays": days,
                "start_time": f"{start_h:02d}:00",
                "end_time": f"{end_h:02d}:00",
                "slot_minutes": slot,
                "mode": mode,
                "capacity": capacity,
                "price": price,
                "currency": settings.default_currency,
                "location": venue,
                "status": "active",
                "counsellor_id": (counsellor or {}).get("_id"),
                "counsellor_name": (counsellor or {}).get("name"),
                "created_at": now,
                "updated_at": now,
            })
        print("Seeded weekly counselling schedules (Mon-Fri mornings & afternoons, Saturday clinic)")

        # one-off sessions were replaced by the weekly schedule - clear legacy demo data
        await db.counselling_sessions.delete_many({})
        await db.counselling_bookings.delete_many({"schedule_id": {"$exists": False}})
        print("Cleared legacy counselling sessions/bookings")

    if await db.pages.count_documents({}) == 0:
        pages = [
            {"slug": "home", "title": "Home", "subtitle": "", "body": "", "sections": [], "published": True},
            {"slug": "about", "title": "About Us", "subtitle": "Who we are",
             "body": "We are a modern institute dedicated to delivering quality education through expert-led classes, courses and diploma programmes.",
             "sections": [], "published": True},
            {"slug": "contact", "title": "Contact Us", "subtitle": "We'd love to hear from you", "body": "", "sections": [], "published": True},
        ]
        for p in pages:
            p["_id"] = uuid4().hex
            p["created_at"] = now
            p["updated_at"] = now
            await db.pages.insert_one(p)
        print("Seeded pages")

    # ---- Sample media backfill (safe to re-run; only fills entries still missing an image) ----
    prog_ops = []
    async for p in db.programmes.find(
        {"$or": [{"cover_image_url": None}, {"cover_image_url": ""}]}, {"slug": 1}
    ):
        slug = p.get("slug") or p["_id"]
        prog_ops.append(
            UpdateOne({"_id": p["_id"]}, {"$set": {"cover_image_url": f"https://picsum.photos/seed/{slug}/800/450"}})
        )
    if prog_ops:
        await db.programmes.bulk_write(prog_ops)
        print(f"Backfilled cover images for {len(prog_ops)} programme(s)")

    avatar_ops = []
    async for u in db.users.find(
        {"role": "counselor", "$or": [{"avatar_url": None}, {"avatar_url": ""}]}, {"_id": 1}
    ):
        avatar_ops.append(
            UpdateOne({"_id": u["_id"]}, {"$set": {"avatar_url": f"https://i.pravatar.cc/300?u={u['_id']}"}})
        )
    if avatar_ops:
        await db.users.bulk_write(avatar_ops)
        print(f"Backfilled sample avatars for {len(avatar_ops)} counsellor(s)")

    print("Seed complete.")


async def seed() -> None:
    """CLI wrapper: connect, seed, disconnect."""
    await connect_db()
    try:
        await seed_db(get_db())
    finally:
        await close_db()


async def reset_programmes():
    """--reset-programmes: delete ALL programmes (and their content) and insert the three English demo programmes."""
    await connect_db()
    try:
        db = get_db()
        now = datetime.now(timezone.utc)
        await _delete_all_programmes(db)
        await _install_programme_samples(db, now)
        print("Programme reset complete.")
    finally:
        await close_db()


if __name__ == "__main__":
    import sys

    if "--reset-programmes" in sys.argv:
        asyncio.run(reset_programmes())
    asyncio.run(seed())
