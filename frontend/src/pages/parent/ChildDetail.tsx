import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Award, BookOpen, CheckCircle2, FileText, Lock } from "lucide-react";
import { api } from "../../lib/api";
import type { ChildOverview } from "../../lib/types";
import { Badge, Card, EmptyState, LoadingBlock, ProgressBar } from "../../components/ui";

export default function ChildDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const [data, setData] = useState<ChildOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    api
      .get<ChildOverview>(`/parents/children/${studentId}/overview`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <LoadingBlock label="Loading your child's progress..." />;
  if (error) return <EmptyState title="Unavailable" subtitle={error} />;
  if (!data) return <EmptyState title="Student not found" />;

  const active = data.enrolments.filter((e) => e.status === "active");
  const done = data.enrolments.filter((e) => (e.progress_percent || 0) >= 100);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/parent" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Back to my children
          </Link>
          <h1 className="text-2xl font-extrabold">{data.student.name}</h1>
          <p className="text-sm text-muted">{data.student.email}</p>
        </div>
        <div className="flex gap-4 text-center">
          <div className="rounded-xl border border-border bg-card px-4 py-2">
            <div className="text-xl font-bold text-primary">{active.length}</div>
            <div className="text-[11px] text-muted">Active</div>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-2">
            <div className="text-xl font-bold text-success">{data.certificates.length}</div>
            <div className="text-[11px] text-muted">Certificates</div>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-2">
            <div className="text-xl font-bold text-accent">{done.length}</div>
            <div className="text-[11px] text-muted">Completed</div>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <BookOpen className="h-5 w-5 text-primary" /> Programme progress
        </h2>
        {data.enrolments.length === 0 ? (
          <Card className="p-8 text-center text-muted">No programmes yet.</Card>
        ) : (
          <div className="space-y-4">
            {data.enrolments.map((e) => (
              <Card key={e.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold">{e.programme?.title}</h3>
                      <Badge status={e.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {e.programme?.type} · {e.completed_lessons ?? 0}/{e.total_lessons ?? "?"} lessons
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-extrabold text-primary">{e.progress_percent || 0}%</div>
                    <div className="text-[11px] text-muted">complete</div>
                  </div>
                </div>
                <div className="mt-4">
                  <ProgressBar value={e.progress_percent || 0} />
                </div>
                {(e.progress_percent || 0) >= 100 && e.status === "active" && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Programme completed
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Award className="h-5 w-5 text-warning" /> Certificates
        </h2>
        {data.certificates.length === 0 ? (
          <Card className="p-8 text-center text-muted">
            <Lock className="mx-auto mb-2 h-6 w-6" />
            No certificates yet — they are issued when a programme reaches 100%.
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.certificates.map((c) => (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{c.programme?.title || c.programme_name}</p>
                    <p className="mt-1 text-xs text-muted">
                      Issued {c.issued_at ? new Date(c.issued_at).toLocaleDateString() : "—"}
                      {c.final_grade != null ? ` · Grade ${c.final_grade}` : ""}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted">{c.cert_no}</p>
                  </div>
                  <Badge status={c.status} />
                </div>
                <Link to={`/verify/${c.cert_no}`} target="_blank" className="btn-ghost mt-4 w-full justify-center">
                  Verify certificate
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <FileText className="h-5 w-5 text-accent" /> Lecture notes
        </h2>
        {data.notes.length === 0 ? (
          <Card className="p-8 text-center text-muted">No notes from lecturers yet.</Card>
        ) : (
          <div className="space-y-3">
            {data.notes.map((n) => (
              <Card key={n.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold">{n.title}</h3>
                  <span className="text-xs text-muted">
                    {n.created_at ? new Date(n.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{n.body}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {n.author && (
                    <span className="rounded-lg bg-surface2 px-2 py-1 font-semibold">
                      {n.author.name}
                      {n.author.role ? ` · ${n.author.role}` : ""}
                    </span>
                  )}
                  {n.programme && <span className="rounded-lg bg-primary/10 px-2 py-1 text-primary">{n.programme.title}</span>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
