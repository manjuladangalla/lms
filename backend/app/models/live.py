from datetime import datetime

from pydantic import BaseModel, Field


class LiveSessionIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    start_time: datetime | None = None
    end_time: datetime | None = None
    duration_min: int = Field(default=60, ge=15, le=480)
    provider: str = Field(default="zoom", pattern="^(zoom|manual)$")
    manual_join_url: str | None = None
    passcode: str | None = None
    status: str = Field(default="scheduled", pattern="^(scheduled|live|ended|cancelled)$")
    create_zoom: bool = True
    # Recurrence — occurrences are materialized from start_time until recurrence_until
    recurrence: str = Field(default="none", pattern="^(none|daily|weekly|monthly)$")
    recurrence_until: datetime | None = None
    # Optional link to a lesson — "live class for this lesson"
    lesson_id: str | None = None
