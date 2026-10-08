import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList, Inbox } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import type { Assignment, AssignmentSubmission } from "../../lib/types";
import { Alert, Badge, Button, Card, EmptyState, LoadingBlock, Textarea } from "../../components/ui";

export default function StudentAssignments() {
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");

  const load = () => {
    api
      .get<Assignment[]>("/assignments/mine")
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const submit = async (aid: string) => {
    setBusy(true);
    setError("");
    try {
      const sub = await api.post<AssignmentSubmission>(`/assignments/${aid}/submit`, { text, file_url: null });
      setItems((prev) => prev.map((a) => (a.id === aid ? { ...a, submission: sub } : a)));
      setOpen(null);
      setText("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="container-x flex h-16 items-center justify-between">
          <Link to="/dashboard" className="font-extrabold text-primary">
            LMS
          </Link>
          <Link to="/dashboard" className="btn-ghost">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="container-x py-8">
        <div className="mb-6 flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-extrabold">Assignments</h1>
            <p className="text-sm text-muted">Submit work for your enrolled programmes.</p>
          </div>
        </div>

        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}

        {items.length === 0 ? (
          <EmptyState
            title="No assignments"
            subtitle="Assignments from your programmes will appear here."
            action={
              <Link to="/dashboard" className="btn-primary mt-3">
                Back to Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
        ) : (
          <div className="space-y-4">
            {items.map((a) => {
              const sub = a.submission;
              const graded = sub?.status === "graded";
              return (
                <Card key={a.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">{a.title}</h3>
                        <Badge status={graded ? "graded" : sub ? "pending" : a.status} />
                        {graded && sub?.score != null && (
                          <span className="text-sm font-semibold text-success">
                            {sub.score}/{a.max_marks}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {a.programme?.title}
                        {a.subject ? ` · ${a.subject.title}` : ""}
                        {a.due_at ? ` · Due ${new Date(a.due_at).toLocaleDateString()}` : ""} · Max {a.max_marks} marks
                      </p>
                      {a.description && <p className="mt-2 text-sm">{a.description}</p>}
                      {sub?.feedback && (
                        <p className="mt-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
                          <b>Feedback:</b> {sub.feedback}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!sub && (
                        <Button onClick={() => { setOpen(open === a.id ? null : a.id); setText(""); }}>
                          {open === a.id ? "Close" : "Submit"}
                        </Button>
                      )}
                      {sub && (
                        <Badge status={sub.status} />
                      )}
                    </div>
                  </div>

                  {open === a.id && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Write your answer or paste a link to your work..."
                      />
                      <Button loading={busy} disabled={!text.trim()} onClick={() => submit(a.id)}>
                        <Inbox className="h-4 w-4" /> Submit assignment
                      </Button>
                    </div>
                  )}

                  {sub && !graded && (
                    <p className="mt-3 text-xs text-muted">
                      Submitted {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : ""} · awaiting grading
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
