"""Seed default institute settings, admin user, demo content."""
import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from app.core.config import settings
from app.core.database import connect_db, get_db, close_db
from app.core.security import hash_password
from app.routers.site import DEFAULT_SETTINGS


async def seed():
    await connect_db()
    db = get_db()
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

    if await db.programmes.count_documents({}) == 0:
        samples = [
            ("class", "Web Development Bootcamp", 49, "Learn HTML, CSS, JS and React in 6 weeks."),
            ("course", "Python for Beginners", 29, "Master Python fundamentals with hands-on projects."),
            ("diploma", "Diploma in Data Science", 199, "Complete diploma covering statistics, ML and data engineering."),
        ]
        for i, (ptype, title, price, summary) in enumerate(samples):
            pid = uuid4().hex
            await db.programmes.insert_one({
                "_id": pid,
                "type": ptype,
                "title": title,
                "slug": title.lower().replace(" ", "-"),
                "summary": summary,
                "description": summary,
                "cover_image_url": None,
                "category": "Technology",
                "level": "Beginner",
                "duration": "6 weeks",
                "price": price,
                "currency": settings.default_currency,
                "is_free": False,
                "status": "published",
                "instructor_ids": [],
                "prerequisites": [],
                "learn_outcomes": ["Core concepts", "Practical projects", "Certificate of completion"],
                "sort_order": i,
                "final_exam_required": ptype == "diploma",
                "created_at": now,
                "updated_at": now,
            })
            sid = uuid4().hex
            await db.subjects.insert_one({
                "_id": sid, "programme_id": pid, "title": "Module 1: Foundations",
                "description": "Core concepts and basics.", "sort_order": 0,
                "is_free_preview": True, "created_at": now,
            })
            for li in range(1, 4):
                await db.lessons.insert_one({
                    "_id": uuid4().hex, "programme_id": pid, "subject_id": sid,
                    "title": f"Lesson {li}: Introduction", "content": f"Lesson {li} content goes here.",
                    "video_url": None, "duration_min": 15, "sort_order": li,
                    "is_free_preview": li == 1, "status": "published", "created_at": now,
                })
        print("Seeded demo programmes")

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

    await close_db()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
