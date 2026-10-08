import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import type { Attempt, Question } from "../../lib/types";
import { Alert, Badge, Button, Card, LoadingBlock, Modal, ProgressBar } from "../../components/ui";
import { StudentHeader } from "./Exams";

export default function TakeExam() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<Attempt | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [uploadingPaper, setUploadingPaper] = useState(false);
  const startedRef = useRef(false);

  const start = useCallback(async () => {
    if (!examId || startedRef.current) return;
    startedRef.current = true;
    try {
      const a = await api.post<Attempt>(`/exams/${examId}/start`, {});
      setAttempt(a);
      setQuestions((a.questions as Question[]) || []);
      if (a.deadline) setSeconds(Math.max(0, Math.floor(a.deadline - Date.now() / 1000)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start exam");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    start();
  }, [start]);

  useEffect(() => {
    if (!attempt || result) return;
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(t);
          submit(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [attempt, result]);

  const setAnswer = (qid: string, value: unknown) => {
    setAnswers((a) => ({ ...a, [qid]: value }));
    api.put(`/attempts/${attempt!.id}/answer`, { question_id: qid, answer: value }).catch(() => {});
  };

  const submit = async (auto = false) => {
    if (!attempt || busy) return;
    const mode = attempt.exam?.submission_mode || "online";
    if ((mode === "file" || mode === "both") && !attempt.answer_file_url) {
      setError("Upload your answer paper before submitting.");
      setConfirm(false);
      return;
    }
    setBusy(true);
    try {
      const payload = Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer }));
      const r = await api.post<Attempt>(`/attempts/${attempt.id}/submit`, { answers: payload });
      setResult(r);
      setConfirm(false);
      if (auto) setError("Time is up — your answers were submitted automatically.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingBlock label="Preparing exam..." />;

  if (error && !attempt) {
    return (
      <div className="min-h-screen bg-bg">
        <StudentHeader title="Exam" />
        <div className="container-x py-10">
          <Alert type="error">{error}</Alert>
          <Button className="mt-4" onClick={() => navigate("/dashboard/exams")}>
            Back to Exams
          </Button>
        </div>
      </div>
    );
  }

  if (result) {
    const pending = (result.status || "") === "grading";
    return (
      <div className="min-h-screen bg-bg">
        <StudentHeader title="Exam Result" />
        <div className="container-x max-w-2xl py-10">
          <Card className="p-8 text-center">
            <CheckCircle2 className={`mx-auto h-14 w-14 ${result.is_passed ? "text-success" : "text-warning"}`} />
            <h1 className="mt-4 text-2xl font-extrabold">
              {pending ? "Submitted for grading" : result.is_passed ? "You passed!" : "Not passed"}
            </h1>
            {error && <div className="mt-3"><Alert type="warning">{error}</Alert></div>}
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-surface2 p-4">
                <p className="text-2xl font-extrabold">{result.obtained ?? 0}</p>
                <p className="text-xs text-muted">Score</p>
              </div>
              <div className="rounded-xl bg-surface2 p-4">
                <p className="text-2xl font-extrabold">{result.total}</p>
                <p className="text-xs text-muted">Total</p>
              </div>
              <div className="rounded-xl bg-surface2 p-4">
                <p className="text-2xl font-extrabold">{result.percentage ?? 0}%</p>
                <p className="text-xs text-muted">Percent</p>
              </div>
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={() => navigate("/dashboard/results")}>View Results</Button>
              <Button variant="ghost" onClick={() => navigate("/dashboard/exams")}>
                Back to Exams
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!attempt) return null;

  const examInfo = attempt.exam || null;
  const mode = examInfo?.submission_mode || "online";
  const needsPaper = mode === "file" || mode === "both";
  const paperUrl = examInfo?.paper_file_url || null;
  const hasPaper = !!attempt.answer_file_url;
  const paperOnly = needsPaper && questions.length === 0;

  const uploadPaper = async (file: File) => {
    setUploadingPaper(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("prefix", "exam-answers");
      const res = await api.upload<{ url: string }>("/upload", fd);
      await api.post(`/attempts/${attempt.id}/answer-file`, { url: res.url });
      setAttempt({ ...attempt, answer_file_url: res.url });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setUploadingPaper(false);
    }
  };

  const q = questions[idx];
  const answered = Object.keys(answers).length;
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;

  const paperCard = needsPaper ? (
    <Card className="mb-6 border-primary/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">Answer paper</p>
          <p className="mt-1 text-xs text-muted">
            {paperUrl
              ? "Download the question paper, answer on paper, then upload a photo/PDF before submitting."
              : "Write your answers on paper, then upload a photo/PDF before submitting."}
          </p>
        </div>
        {paperUrl && (
          <a className="btn-ghost" href={paperUrl} target="_blank" rel="noreferrer">
            Download question paper
          </a>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className={`btn-primary ${uploadingPaper ? "pointer-events-none opacity-60" : ""}`}>
          {uploadingPaper ? "Uploading…" : hasPaper ? "Replace answer paper" : "Upload answer paper"}
          <input
            type="file"
            className="hidden"
            accept="image/*,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadPaper(f);
              e.target.value = "";
            }}
          />
        </label>
        {hasPaper && (
          <a className="text-xs text-primary hover:underline" href={attempt.answer_file_url as string} target="_blank" rel="noreferrer">
            View uploaded paper
          </a>
        )}
        {hasPaper && <Badge status="published">Paper attached</Badge>}
      </div>
    </Card>
  ) : null;

  return (
    <div className="min-h-screen bg-bg">
      <StudentHeader title={attempt.exam?.title || "Exam"} />
      <div className="container-x max-w-3xl py-8">
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}

        {paperCard}

        {!paperOnly && (
          <Card className="mb-6 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="mb-1.5 flex justify-between text-xs text-muted">
                  <span>
                    Question {idx + 1} of {questions.length}
                  </span>
                  <span>
                    Answered {answered}/{questions.length}
                  </span>
                </div>
                <ProgressBar value={((idx + 1) / Math.max(1, questions.length)) * 100} />
              </div>
              <div className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold ${seconds < 60 ? "bg-danger/10 text-danger" : "bg-surface2"}`}>
                <Clock className="h-4 w-4" /> {mm}:{String(ss).padStart(2, "0")}
              </div>
            </div>
          </Card>
        )}

        {paperOnly && (
          <Card className="mb-6 flex items-center justify-between gap-4 p-4">
            <p className="text-sm text-muted">
              Answer on paper, upload it above, then submit for grading.
            </p>
            <div className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold ${seconds < 60 ? "bg-danger/10 text-danger" : "bg-surface2"}`}>
              <Clock className="h-4 w-4" /> {mm}:{String(ss).padStart(2, "0")}
            </div>
          </Card>
        )}

        {q && (
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-2">
                <Badge>{q.type.replace("_", " ")}</Badge>
                <Badge status="pending">{q.marks} mark(s)</Badge>
              </div>
            </div>
            <h2 className="mt-4 text-lg font-bold">{q.statement}</h2>

            <div className="mt-5 space-y-3">
              {q.type === "mcq" &&
                (q.options || []).map((opt, i) => (
                  <label
                    key={i}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm transition ${
                      answers[q.id] === opt ? "border-primary bg-primary/10" : "border-border hover:bg-surface2"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === opt}
                      onChange={() => setAnswer(q.id, opt)}
                      className="accent-[rgb(var(--primary))]"
                    />
                    {opt}
                  </label>
                ))}

              {q.type === "true_false" &&
                ["true", "false"].map((opt) => (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm capitalize transition ${
                      answers[q.id] === opt ? "border-primary bg-primary/10" : "border-border hover:bg-surface2"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === opt}
                      onChange={() => setAnswer(q.id, opt)}
                      className="accent-[rgb(var(--primary))]"
                    />
                    {opt}
                  </label>
                ))}

              {(q.type === "fill_blank" || q.type === "short_answer") && (
                <input
                  className="input"
                  placeholder="Type your answer..."
                  value={String(answers[q.id] ?? "")}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                />
              )}

              {q.type === "essay" && (
                <textarea
                  className="input min-h-[180px]"
                  placeholder="Write your answer..."
                  value={String(answers[q.id] ?? "")}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                />
              )}

              {q.type === "ordering" && (
                <div className="space-y-2">
                  {(q.correct_answer as string[] | undefined || []).map((_, i) => (
                    <input
                      key={i}
                      className="input"
                      placeholder={`Position ${i + 1}`}
                      value={String((answers[q.id] as string[] | undefined)?.[i] ?? "")}
                      onChange={(e) => {
                        const arr = [...(((answers[q.id] as string[]) || (q.correct_answer as string[]) || []).map(String))];
                        arr[i] = e.target.value;
                        setAnswer(q.id, arr);
                      }}
                    />
                  ))}
                  {!q.correct_answer && (
                    <input
                      className="input"
                      placeholder="Comma-separated order"
                      value={String(answers[q.id] ?? "")}
                      onChange={(e) => setAnswer(q.id, e.target.value.split(",").map((s) => s.trim()))}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="mt-7 flex justify-between">
              <Button variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
                Previous
              </Button>
              {idx < questions.length - 1 ? (
                <Button onClick={() => setIdx(idx + 1)}>Next</Button>
              ) : (
                <Button onClick={() => setConfirm(true)}>Submit Exam</Button>
              )}
            </div>
          </Card>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {questions.map((qq, i) => (
            <button
              key={qq.id}
              onClick={() => setIdx(i)}
              className={`h-9 w-9 rounded-lg text-xs font-bold transition ${
                answers[qq.id] != null && answers[qq.id] !== ""
                  ? "bg-primary text-white"
                  : i === idx
                    ? "border-2 border-primary text-primary"
                    : "bg-surface2 text-muted"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {paperOnly && (
          <div className="mt-6">
            <Button className="w-full justify-center" onClick={() => setConfirm(true)}>
              Submit Exam
            </Button>
          </div>
        )}
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Submit exam?">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-warning" />
          <p className="text-sm text-muted">
            {paperOnly
              ? hasPaper
                ? "Your answer paper is attached. You cannot replace it after submission."
                : "You have not uploaded an answer paper yet — submission will be blocked."
              : `You answered ${answered} of ${questions.length} questions. You cannot change answers after submission.`}
            {!paperOnly && needsPaper && !hasPaper && " You must upload your answer paper first."}
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Keep working
          </Button>
          <Button loading={busy} onClick={() => submit()}>
            Submit
          </Button>
        </div>
      </Modal>
    </div>
  );
}
