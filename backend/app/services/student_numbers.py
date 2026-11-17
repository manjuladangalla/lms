"""Sequential student numbers, e.g. STU-00001.

A Mongo counter document (``counters`` / ``student_number``) is incremented
atomically, so concurrent registrations never receive the same number.
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

PREFIX = "STU"
DIGITS = 5
COUNTER_ID = "student_number"


async def next_student_number(db: AsyncIOMotorDatabase) -> str:
    """Return the next student number (STU-00001, STU-00002, ...)."""
    for attempt in range(3):
        try:
            doc = await db.counters.find_one_and_update(
                {"_id": COUNTER_ID},
                {"$inc": {"seq": 1}},
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
            seq = int((doc or {}).get("seq") or 1)
            return f"{PREFIX}-{seq:0{DIGITS}d}"
        except Exception:  # noqa: BLE001 — upsert race on first insert, retry then fall through
            if attempt == 2:
                raise
    raise RuntimeError("could not allocate student number")


def _tail_seq(number: str) -> int:
    tail = (number or "").rsplit("-", 1)[-1]
    return int(tail) if tail.isdigit() else 0


async def backfill_student_numbers(db: AsyncIOMotorDatabase) -> int:
    """Give every student without a number one. Idempotent — never renumbers."""
    students = await db.users.find({"role": "student"}).to_list(length=200_000)
    missing: list[str] = []
    max_seq = 0
    for u in students:
        number = (u.get("student_number") or "").strip()
        if not number:
            missing.append(u["_id"])
        else:
            max_seq = max(max_seq, _tail_seq(number))
    if not missing:
        return 0
    if max_seq:
        # Never hand out a number that already exists (manually assigned ones)
        await db.counters.update_one({"_id": COUNTER_ID}, {"$max": {"seq": max_seq}}, upsert=True)
    for user_id in missing:
        number = await next_student_number(db)
        await db.users.update_one({"_id": user_id}, {"$set": {"student_number": number}})
    return len(missing)


async def new_student_number(db: AsyncIOMotorDatabase, user: dict) -> str | None:
    """Student number for a freshly created user — only students get one."""
    if user.get("role") != "student" or user.get("student_number"):
        return None
    number = await next_student_number(db)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"student_number": number}})
    return number
