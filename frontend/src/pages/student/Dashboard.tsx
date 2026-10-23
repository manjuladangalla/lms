import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Award, BookOpen, BadgeCheck, TrendingUp, Wallet, GraduationCap, ArrowRight, Crown, CheckCircle2, FileText, XCircle } from "lucide-react";
import { api } from "../../lib/api";
import type { Enrolment, StudentDashboard as SD, StudentNote } from "../../lib/types";
import { useAuth } from "../../store/auth";
import { Badge, Button, Card, EmptyState, LoadingBlock, ProgressBar, StatCard } from "../../components/ui";
import { Logo, ThemeSwitcher } from "../../components/layout";
import { useRealtime } from "../../lib/realtime";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<SD | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<StudentNote[]>([]);

  useEffect(() => {
    api
      .get<SD>("/dashboard/student")
      .then(setData)
      .finally(() => setLoading(false));
    api
      .get<{ items: StudentNote[] }>("/notes/mine")
      .then((r) => setNotes((r.items || []).slice(0, 5)))
      .catch(() => {});
  }, []);

  useRealtime((event) => {
    if (["enrolment.updated", "payment.updated", "membership.updated", "note.created"].includes(event)) {
      api.get<SD>("/dashboard/student").then(setData).catch(() => {});
      if (event === "note.created") {
        api.get<{ items: StudentNote[] }>("/notes/mine").then((r) => setNotes((r.items || []).slice(0, 5))).catch(() => {});
      }
    }
  });

  const decide = async (id: string, action: "accept" | "decline") => {
    try {
      await api.post(`/enrolments/${id}/${action}`, { reason: null });
      api.get<SD>("/dashboard/student").then(setData).catch(() => {});
    } catch {
      /* keep quiet; list refresh will show state */
    }
  };

  if (loading) return <LoadingBlock />;
  if (!data) return <EmptyState title="Dashboard unavailable" />;

  const s = data.stats;
  const awaiting = (data.enrolments || []).filter((e: Enrolment) => e.status === "pending_acceptance");

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="container-x flex h-16 items-center justify-between">
          <Logo variant="short" />
          <div className="flex items-center gap-2">
            <ThemeSwitcher compact />
            <Link to="/" className="nav-link">Home</Link>
            <Button
              variant="ghost"
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container-x py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">Hello, {user?.name?.split(" ")[0]} 👋</h1>
            <p className="text-sm text-muted">Track your learning, exams and certificates.</p>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm">
            {[
              { to: "/dashboard", label: "Overview" },
              { to: "/dashboard/exams", label: "Exams" },
              { to: "/dashboard/results", label: "Results" },
              { to: "/dashboard/assignments", label: "Assignments" },
              { to: "/dashboard/certificates", label: "Certificates" },
              { to: "/dashboard/payments", label: "Payments" },
              { to: "/dashboard/membership", label: "Membership" },
              { to: "/dashboard/counselling", label: "Counselling" },
            ].map((l) => (
              <Link key={l.to} to={l.to} className="btn-ghost">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Courses" value={s.active || 0} icon={<BookOpen className="h-5 w-5" />} />
          <StatCard label="Avg Progress" value={`${s.avg_progress || 0}%`} icon={<TrendingUp className="h-5 w-5" />} accent="from-accent to-primary2" />
          <StatCard label="Exams Passed" value={s.exams_taken || 0} icon={<GraduationCap className="h-5 w-5" />} accent="from-success to-accent" />
          <StatCard label="Certificates" value={s.certificates || 0} icon={<Award className="h-5 w-5" />} accent="from-warning to-danger" />
        </div>

        {(s.pending_payments || 0) > 0 && (
          <Card className="mt-6 flex items-center justify-between gap-4 border-warning/40 bg-warning/5 p-4">
            <p className="text-sm">
              You have <b>{s.pending_payments}</b> payment(s) awaiting confirmation.
            </p>
            <Link to="/dashboard/payments" className="btn-ghost">Review</Link>
          </Card>
        )}

        {awaiting.length > 0 && (
          <Card className="mt-6 border-warning/40 bg-warning/5 p-5">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <CheckCircle2 className="h-5 w-5 text-warning" /> Enrolments awaiting your acceptance
            </h2>
            <div className="space-y-3">
              {awaiting.map((e) => (
                <div key={e.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{e.programme?.title}</p>
                    <p className="text-xs text-muted">
                      Added by {e.requested_by_user?.name || (e.requested_by_role === "parent" ? "your parent" : "the institute")}
                      {e.note ? ` · "${e.note}"` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => decide(e.id, "accept")}>
                      <CheckCircle2 className="h-4 w-4" /> Accept
                    </Button>
                    <Button variant="danger" onClick={() => decide(e.id, "decline")}>
                      <XCircle className="h-4 w-4" /> Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-3 text-lg font-bold">My Learning</h2>
            {data.enrolments.length === 0 ? (
              <EmptyState
                title="No enrolments yet"
                subtitle="Browse classes, courses and diplomas to get started."
                action={
                  <Link to="/courses" className="btn-primary mt-3">
                    Browse Programmes <ArrowRight className="h-4 w-4" />
                  </Link>
                }
              />
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
                          {e.programme?.type} · {e.progress_percent || 0}% complete
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {e.certificate_id && (
                          <Link to="/dashboard/certificates" className="btn-ghost">
                            <BadgeCheck className="h-4 w-4" /> Certificate
                          </Link>
                        )}
                        <Link to={`/learn/${e.programme_id}`} className="btn-primary">
                          {e.status === "active" ? "Continue" : "View"}
                        </Link>
                      </div>
                    </div>
                    <div className="mt-4">
                      <ProgressBar value={e.progress_percent || 0} />
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <h2 className="mb-3 mt-8 text-lg font-bold">Recent Exam Attempts</h2>
            {data.recent_attempts.length === 0 ? (
              <EmptyState title="No exams yet" subtitle="Take an exam from your course player." />
            ) : (
              <div className="space-y-3">
                {data.recent_attempts.map((a) => (
                  <Card key={a.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{a.exam?.title}</p>
                      <p className="text-xs text-muted">
                        {a.obtained != null ? `${a.obtained}/${a.total} · ${a.percentage ?? 0}%` : "In progress"} ·{" "}
                        {new Date(a.created_at || Date.now()).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge status={a.status} />
                      {a.is_passed && <Badge status="published">Passed</Badge>}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-warning" />
                <h3 className="font-bold">Membership</h3>
              </div>
              {data.membership ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="font-semibold">{data.membership.plan?.name}</p>
                  <p className="text-muted">Expires {new Date(data.membership.expires_at!).toLocaleDateString()}</p>
                  <Badge status="active">Active</Badge>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-muted">No active membership.</p>
                  <Link to="/memberships" className="btn-primary mt-3 w-full">
                    View Plans
                  </Link>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-accent" />
                <h3 className="font-bold">Lecture Notes</h3>
              </div>
              <div className="mt-3 space-y-3">
                {notes.length === 0 && <p className="text-sm text-muted">No notes from lecturers yet.</p>}
                {notes.map((n) => (
                  <div key={n.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {n.author?.name}
                      {n.created_at ? ` · ${new Date(n.created_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <h3 className="font-bold">Recent Payments</h3>
              </div>
              <div className="mt-3 space-y-3">
                {data.payments.length === 0 && <p className="text-sm text-muted">No payments yet.</p>}
                {data.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">
                        {p.currency} {p.amount}
                      </p>
                      <p className="text-xs text-muted capitalize">{p.provider} · {p.purpose}</p>
                    </div>
                    <Badge status={p.status} />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
