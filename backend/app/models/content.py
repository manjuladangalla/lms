from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ProgrammeIn(BaseModel):
    type: str = Field(pattern="^(class|course|diploma)$")
    title: str = Field(min_length=2, max_length=200)
    slug: str | None = None
    summary: str = ""
    description: str = ""
    cover_image_url: str | None = None
    # Public intro video (YouTube link or uploaded file) — viewable without login/payment
    intro_video_url: str | None = None
    category: str | None = None
    level: str | None = None
    duration: str | None = None
    price: float = Field(default=0, ge=0)
    currency: str | None = None
    is_free: bool = False
    status: str = "draft"
    instructor_ids: list[str] = []
    prerequisites: list[str] = []
    learn_outcomes: list[str] = []
    sort_order: int = 0
    final_exam_required: bool = False
    # Pricing: once = one-time full price; subscription = recurring with access expiry;
    # per_lesson / per_module = individual permanent unlocks (prices on lessons/subjects)
    pricing_mode: str = Field(default="once", pattern="^(once|subscription|per_lesson|per_module)$")
    # Billing period for subscription courses: weekly (7d), monthly (30d), semester (4 months = 120d), yearly (365d)
    billing_interval: str | None = Field(default="monthly", pattern="^(weekly|monthly|semester|yearly)$")
    # Scoring weights (percent) — institute/lecturer configurable
    assignment_weight: float = Field(default=40, ge=0, le=100)
    exam_weight: float = Field(default=60, ge=0, le=100)
    pass_percent: float = Field(default=50, ge=0, le=100)


class SubjectIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    sort_order: int = 0
    is_free_preview: bool = False
    # Optional module time frame — applies only when set by admin/lecturer
    start_at: datetime | None = None
    due_at: datetime | None = None
    # Module price — used when the programme pricing_mode is per_module
    price: float = Field(default=0, ge=0)


class LessonIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""
    video_url: str | None = None
    duration_min: int = 0
    sort_order: int = 0
    is_free_preview: bool = False
    status: str = "published"
    # Optional lesson schedule — overrides module window when set (opt-in)
    available_at: datetime | None = None
    due_at: datetime | None = None
    # Lesson price — used when the programme pricing_mode is per_lesson
    price: float = Field(default=0, ge=0)


class MaterialIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    file_url: str = ""
    mime: str | None = None
    size: int | None = None
    subject_id: str | None = None
    lesson_id: str | None = None


class QuestionIn(BaseModel):
    type: str = Field(pattern="^(mcq|true_false|fill_blank|short_answer|essay|matching|ordering)$")
    statement: str
    options: list[str] = []
    correct_answer: Any = None
    accepted_answers: list[str] = []
    marks: float = Field(default=1, gt=0)
    explanation: str = ""
    sort_order: int = 0


class QuestionBulkIn(BaseModel):
    questions: list[QuestionIn]


class ExamIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    type: str = "quiz"
    subject_id: str | None = None
    duration_min: int = Field(default=30, ge=1)
    total_marks: float = Field(default=0, ge=0)
    pass_marks: float = Field(default=0, ge=0)
    max_attempts: int = Field(default=1, ge=1)
    shuffle: bool = True
    status: str = "draft"
    window_start: datetime | None = None
    window_end: datetime | None = None
    # Paper mode: 'online' = browser questions, 'file' = paper upload + manual total,
    # 'both' = questions and paper. Lecturer decides per exam.
    submission_mode: str = Field(default="online", pattern="^(online|file|both)$")
    paper_file_url: str | None = None


class ExamStartIn(BaseModel):
    enrolment_id: str | None = None


class AnswerFileIn(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class AnswerItem(BaseModel):
    question_id: str
    answer: Any = None


class SubmitAttemptIn(BaseModel):
    answers: list[AnswerItem] = []


class SaveAnswerIn(BaseModel):
    question_id: str
    answer: Any = None


class GradeAnswerIn(BaseModel):
    question_id: str
    awarded_marks: float = Field(ge=0)
    feedback: str = ""


class GradeAttemptIn(BaseModel):
    grades: list[GradeAnswerIn] = []
    # Manual paper grading: overall awarded marks + feedback (file/both mode)
    total_awarded: float | None = Field(default=None, ge=0)
    feedback: str = ""
    publish: bool = False


class AssignmentIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    subject_id: str
    due_at: datetime | None = None
    max_marks: float = Field(default=100, gt=0, le=1000)
    status: str = Field(default="published", pattern="^(draft|published)$")


class AssignmentUpdateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    subject_id: str
    due_at: datetime | None = None
    max_marks: float = Field(default=100, gt=0, le=1000)
    status: str = Field(default="published", pattern="^(draft|published)$")


class AssignmentSubmitIn(BaseModel):
    text: str = ""
    file_url: str | None = None


class AssignmentGradeIn(BaseModel):
    score: float = Field(ge=0)
    feedback: str = ""
