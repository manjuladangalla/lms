import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Attempt, Paged, Question } from "../../lib/types";
import { Alert, Badge, Button, Card, Input, LoadingBlock, Modal, Pagination, Table } from "../../components/ui";

interface GradePayload {
  question_id: string;
  awarded_marks: number;
  feedback: string;
}

export default function AdminGrading() {
  const [data, setData] = useState<Paged<Attempt> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [grades, setGrades] = useState<Record<string, GradePayload>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [publish, setPublish] = useState(true);
  const [paperMode, setPaperMode] = useState(false);
  const [totalAwarded, setTotalAwarded] = useState<number>(0);
  const [manualFeedback, setManualFeedback] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.get<Paged<Attempt>>(`/grading/queue?page=${page}&size=15`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  const open = async (a: Attempt) => {
    const full = await api.get<Attempt>(`/attempts/${a.id}`);
    setTarget(full);
    const qs = full.answers?.map((x) => x.question).filter(Boolean) as Question[] | undefined;
    setQuestions(qs || []);
    const g: Record<string, GradePayload> = {};
    (full.answers || []).forEach((ans) => {
      if (ans.feedback === "pending") {
        g[ans.question_id] = { question_id: ans.question_id, awarded_marks: 0, feedback: "" };
      }
    });
    setGrades(g);
    setPaperMode(!!full.manual_grade && (full.answers || []).length === 0);
    setTotalAwarded(0);
    setManualFeedback(full.manual_feedback || "");
  };

  const submitGrade = async () => {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/attempts/${target.id}/grade`, paperMode
        ? { grades: [], total_awarded: Number(totalAwarded) || 0, feedback: manualFeedback, publish }
        : { grades: Object.values(grades), publish });
      setTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Grading failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Grading Queue</h1>
        <p className="text-sm text-muted">Essay and short-answer submissions awaiting manual grading.</p>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Table headers={["Student", "Exam", "Submitted", "Auto score", "Pending", ""]}>
            {(data?.items || []).map((a) => (
              <tr key={a.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3 font-medium">{a.student?.name || "—"}</td>
                <td className="px-4 py-3">{a.exam?.title || "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3">
                  {a.manual_grade && (a.answers || []).length === 0
                    ? <>— / {a.total}</>
                    : <>{a.auto_score ?? 0} / {a.total}</>}
                </td>
                <td className="px-4 py-3">
                  {a.manual_grade && (a.answers || []).length === 0 ? (
                    <Badge status="pending">Paper</Badge>
                  ) : (
                    <Badge status="grading">{a.essay_pending_count} pending</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Button variant="soft" onClick={() => open(a)}>Grade</Button>
                </td>
              </tr>
            ))}
            {(data?.items || []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">Queue is empty 🎉</td>
              </tr>
            )}
          </Table>
          <Pagination page={data?.page || 1} total={data?.total || 0} size={data?.size || 15} onPage={setPage} />
        </>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title={`Grade — ${target?.student?.name || ""}`} wide>
        {error && <div className="mb-3"><Alert type="error">{error}</Alert></div>}
        <div className="space-y-4">
          {paperMode ? (
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Answer paper</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {target?.answer_file_url ? (
                  <a className="btn-ghost" href={target.answer_file_url} target="_blank" rel="noreferrer">
                    View uploaded answer paper
                  </a>
                ) : (
                  <p className="text-sm text-danger">No answer paper was attached to this attempt.</p>
                )}
                <Badge status="pending">Manual grading</Badge>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">Total marks (max {target?.total ?? "?"})</label>
                  <Input
                    type="number"
                    min={0}
                    max={target?.total}
                    className="w-32"
                    value={totalAwarded}
                    onChange={(e) => setTotalAwarded(Number(e.target.value))}
                  />
                </div>
                <div className="min-w-[220px] flex-1">
                  <label className="label">Feedback for student</label>
                  <Input
                    value={manualFeedback}
                    onChange={(e) => setManualFeedback(e.target.value)}
                    placeholder="Optional feedback…"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">
                Enter the overall score for this paper. Passing requires at least the exam's pass marks.
              </p>
            </Card>
          ) : (
            <>
              {(target?.answers || [])
                .filter((a) => a.feedback === "pending" || grades[a.question_id])
                .map((ans) => {
                  const q = questions.find((x) => x.id === ans.question_id);
                  const g = grades[ans.question_id];
                  if (!g) return null;
                  return (
                    <Card key={ans.question_id} className="p-4">
                      <p className="text-xs uppercase tracking-wide text-muted">{q?.type?.replace("_", " ") || "Question"}</p>
                      <p className="mt-1 font-semibold">{q?.statement || ans.question_id}</p>
                      <div className="mt-3 rounded-xl bg-surface2 p-3 text-sm whitespace-pre-wrap">
                        {typeof ans.answer === "string" ? ans.answer : JSON.stringify(ans.answer)}
                      </div>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <div>
                          <label className="label">Marks (max {q?.marks ?? "?"})</label>
                          <Input
                            type="number"
                            min={0}
                            max={q?.marks}
                            className="w-28"
                            value={g.awarded_marks}
                            onChange={(e) =>
                              setGrades({
                                ...grades,
                                [ans.question_id]: { ...g, awarded_marks: Number(e.target.value) },
                              })
                            }
                          />
                        </div>
                        <div className="min-w-[200px] flex-1">
                          <label className="label">Feedback</label>
                          <Input
                            value={g.feedback}
                            onChange={(e) =>
                              setGrades({ ...grades, [ans.question_id]: { ...g, feedback: e.target.value } })
                            }
                          />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              {Object.keys(grades).length === 0 && (
                <p className="text-sm text-muted">No pending manual questions in this attempt.</p>
              )}
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Publish result to student immediately
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
          <Button loading={busy} onClick={submitGrade}>Save grades</Button>
        </div>
      </Modal>
    </div>
  );
}
