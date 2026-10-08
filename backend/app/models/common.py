from enum import Enum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class MessageOut(BaseModel):
    message: str
    detail: Any | None = None


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int = 0
    page: int = 1
    size: int = 20


class ProgrammeType(str, Enum):
    class_ = "class"
    course = "course"
    diploma = "diploma"


class ContentStatus(str, Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class EnrolmentStatus(str, Enum):
    pending_verification = "pending_verification"
    active = "active"
    expired = "expired"
    cancelled = "cancelled"
    revoked = "revoked"


class PaymentStatus(str, Enum):
    pending = "pending"
    succeeded = "succeeded"
    failed = "failed"
    awaiting_verification = "awaiting_verification"
    refunded = "refunded"


class AccessSource(str, Enum):
    free = "free"
    paypal = "paypal"
    manual = "manual"
    membership = "membership"
    admin = "admin"


class QuestionType(str, Enum):
    mcq = "mcq"
    true_false = "true_false"
    fill_blank = "fill_blank"
    short_answer = "short_answer"
    essay = "essay"
    matching = "matching"
    ordering = "ordering"


class AttemptStatus(str, Enum):
    in_progress = "in_progress"
    submitted = "submitted"
    grading = "grading"
    graded = "graded"
    published = "published"


class CertificateStatus(str, Enum):
    issued = "issued"
    revoked = "revoked"


def serialize(doc: dict | None) -> dict | None:
    if doc is None:
        return None
    from datetime import datetime, timezone

    def norm(v: Any) -> Any:
        # Mongo stores naive UTC datetimes — tag them so JS parses correctly
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        if isinstance(v, dict):
            return {k: norm(x) for k, x in v.items()}
        if isinstance(v, list):
            return [norm(x) for x in v]
        return v

    out = {k: norm(v) for k, v in doc.items()}
    if "_id" in out:
        out["id"] = str(out.pop("_id"))
    return out


def serialize_many(docs: list[dict]) -> list[dict]:
    return [serialize(d) for d in docs]


class IdName(BaseModel):
    id: str
    name: str
