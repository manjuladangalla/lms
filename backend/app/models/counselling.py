from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

ScheduleMode = Literal["online", "in_person", "both"]
BookingMode = Literal["online", "in_person"]
ScheduleStatus = Literal["active", "paused"]
BookingStatus = Literal["booked", "cancelled", "attended"]

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _minutes(value: str) -> int:
    parts = value.split(":")
    if len(parts) != 2:
        raise ValueError("time must be HH:MM")
    try:
        hour, minute = int(parts[0]), int(parts[1])
    except ValueError as exc:
        raise ValueError("time must be HH:MM") from exc
    if not (0 <= hour < 24 and 0 <= minute < 60):
        raise ValueError("time must be a valid clock time")
    return hour * 60 + minute


def _normalize_time(value: str) -> str:
    total = _minutes(value)
    return f"{total // 60:02d}:{total % 60:02d}"


class CounsellingScheduleIn(BaseModel):
    """Weekly availability rule - e.g. "every Monday, 09:00-14:00, one session per 60 min"."""

    title: str = Field(min_length=3, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    weekdays: list[int] = Field(min_length=1, max_length=7, description="0 = Monday ... 6 = Sunday")
    start_time: str = "09:00"
    end_time: str = "12:00"
    slot_minutes: int = Field(default=30, ge=10, le=240, description="session length in minutes")
    mode: ScheduleMode = "both"
    capacity: int = Field(default=1, ge=1, le=20, description="1 = one-to-one, a slot is full at capacity")
    price: float = Field(default=0.0, ge=0)
    currency: str = Field(default="USD", min_length=1, max_length=8)
    location: str | None = Field(default=None, max_length=200)
    status: ScheduleStatus = "active"

    @model_validator(mode="after")
    def _check_range(self) -> "CounsellingScheduleIn":
        if any(d < 0 or d > 6 for d in self.weekdays):
            raise ValueError("weekdays must be 0 (Monday) to 6 (Sunday)")
        self.weekdays = sorted(set(self.weekdays))
        start = _minutes(self.start_time)
        end = _minutes(self.end_time)
        if end <= start:
            raise ValueError("end_time must be after start_time")
        if end - start < self.slot_minutes:
            raise ValueError("the range must fit at least one full slot")
        self.start_time = _normalize_time(self.start_time)
        self.end_time = _normalize_time(self.end_time)
        return self


class CounsellingSchedulePatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    weekdays: list[int] | None = Field(default=None, min_length=1, max_length=7)
    start_time: str | None = None
    end_time: str | None = None
    slot_minutes: int | None = Field(default=None, ge=10, le=240)
    mode: ScheduleMode | None = None
    capacity: int | None = Field(default=None, ge=1, le=20)
    price: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=1, max_length=8)
    location: str | None = Field(default=None, max_length=200)
    status: ScheduleStatus | None = None

    @model_validator(mode="after")
    def _check_weekdays(self) -> "CounsellingSchedulePatch":
        if self.weekdays is not None:
            days = sorted(set(self.weekdays))
            if any(d < 0 or d > 6 for d in days):
                raise ValueError("weekdays must be 0 (Monday) to 6 (Sunday)")
            self.weekdays = days
        if self.start_time is not None:
            self.start_time = _normalize_time(self.start_time)
        if self.end_time is not None:
            self.end_time = _normalize_time(self.end_time)
        return self


class CounsellingBookingIn(BaseModel):
    schedule_id: str = Field(min_length=1)
    slot_start: datetime
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=1000)
    mode: BookingMode | None = None


class CounsellingBookingPatch(BaseModel):
    status: BookingStatus
