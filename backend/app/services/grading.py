"""Exam grading helpers: objective auto-grading + manual-essay detection."""
from typing import Any


def _norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def grade_question(question: dict, answer: Any) -> tuple[float, str]:
    """Return (awarded_marks, feedback) for objective questions.
    Manual types return (0, 'pending') so they route to the grading queue."""
    qtype = question.get("type")
    marks = float(question.get("marks", 1) or 1)
    if qtype in ("essay", "short_answer"):
        return 0.0, "pending"

    if qtype == "mcq":
        correct = question.get("correct_answer")
        if _norm(answer) == _norm(correct):
            return marks, "Correct"
        return 0.0, "Incorrect"

    if qtype == "true_false":
        correct = question.get("correct_answer")
        if _norm(answer) in ("true", "t", "1", "yes") and _norm(correct) in ("true", "t", "1", "yes"):
            return marks, "Correct"
        if _norm(answer) in ("false", "f", "0", "no") and _norm(correct) in ("false", "f", "0", "no"):
            return marks, "Correct"
        if _norm(answer) == _norm(correct):
            return marks, "Correct"
        return 0.0, "Incorrect"

    if qtype == "fill_blank":
        accepted = [_norm(a) for a in (question.get("accepted_answers") or [])]
        if not accepted and question.get("correct_answer") is not None:
            accepted = [_norm(question.get("correct_answer"))]
        if _norm(answer) in accepted:
            return marks, "Correct"
        return 0.0, "Incorrect"

    if qtype == "ordering":
        correct = [_norm(x) for x in (question.get("correct_answer") or [])]
        given = [_norm(x) for x in (answer or [])] if isinstance(answer, list) else []
        if correct and correct == given:
            return marks, "Correct"
        return 0.0, "Incorrect"

    if qtype == "matching":
        correct = question.get("correct_answer") or {}
        if isinstance(correct, dict) and isinstance(answer, dict):
            ok = all(_norm(answer.get(k)) == _norm(v) for k, v in correct.items())
            if ok:
                return marks, "Correct"
        return 0.0, "Incorrect"

    return 0.0, "pending"


def needs_manual_grade(question: dict) -> bool:
    return question.get("type") in ("essay", "short_answer")


def compute_totals(attempt: dict, questions: list[dict]) -> dict:
    qmap = {str(q["_id"]): q for q in questions}
    obtained = 0.0
    pending = 0
    for ans in attempt.get("answers", []):
        obtained += float(ans.get("awarded_marks") or 0)
        if ans.get("feedback") == "pending":
            pending += 1
    return {"obtained": obtained, "pending": pending, "total": sum(float(q.get("marks", 1) or 1) for q in questions)}


async def compute_final_grade(db, user_id: str, programme_id: str) -> dict:
    """Weighted final grade: assignment% × assignment_weight + exam% × exam_weight.

    Weights are normalised to their sum, so (40,60) or (0,100) both work.
    """
    programme = await db.programmes.find_one({"_id": programme_id})
    aw = float((programme or {}).get("assignment_weight", 40) or 0)
    ew = float((programme or {}).get("exam_weight", 60) or 0)
    pass_percent = float((programme or {}).get("pass_percent", 50) or 50)

    subs = await db.assignment_submissions.find(
        {"user_id": user_id, "programme_id": programme_id, "status": "graded"}
    ).to_list(length=500)
    assignment_percent = 0.0
    if subs:
        pcts = []
        for s in subs:
            max_m = float(s.get("max_marks") or 100) or 100
            pcts.append(min(100.0, (float(s.get("score") or 0) / max_m) * 100))
        assignment_percent = round(sum(pcts) / len(pcts), 2)

    attempts = await db.exam_attempts.find(
        {
            "user_id": user_id,
            "programme_id": programme_id,
            "status": {"$in": ["graded", "published"]},
            "percentage": {"$ne": None},
        }
    ).to_list(length=500)
    exam_percent = 0.0
    if attempts:
        best: dict[str, float] = {}
        for a in attempts:
            eid = a.get("exam_id")
            pct = float(a.get("percentage") or 0)
            if eid is None:
                continue
            best[eid] = max(best.get(eid, 0.0), pct)
        if best:
            exam_percent = round(sum(best.values()) / len(best), 2)

    total_w = aw + ew
    if total_w <= 0:
        final = exam_percent or assignment_percent
    else:
        final = round((assignment_percent * aw + exam_percent * ew) / total_w, 2)

    return {
        "final_grade": final,
        "assignment_percent": assignment_percent,
        "exam_percent": exam_percent,
        "assignment_weight": aw,
        "exam_weight": ew,
        "pass_percent": pass_percent,
        "passed": final >= pass_percent,
    }
