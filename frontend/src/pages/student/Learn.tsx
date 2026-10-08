import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, FileText, GraduationCap, Lock, Menu, Unlock, Video, X } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import type { Enrolment, Exam, LiveSession, Programme } from "../../lib/types";
import { Alert, Badge, Button, Card, LoadingBlock, ProgressBar } from "../../components/ui";
import { PromoQuote } from "../../components/PromoQuote";

export default function Learn() {
  const { programmeId } = useParams();
  const navigate = useNavigate();
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState<string | null>(null);
  const [renewPromo, setRenewPromo] = useState<string | null>(null);
  const [unlockPromo, setUnlockPromo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!programmeId) return;
    try {
      const [p, ens, ex, live] = await Promise.all([
        api.get<Programme>(`/programmes/${programmeId}`),
        api.get<Enrolment[]>("/enrolments/mine"),
        api.get<Exam[]>(`/programmes/${programmeId}/exams`).catch(() => []),
        api.get<LiveSession[]>(`/programmes/${programmeId}/live-sessions`).catch(() => []),
      ]);
      setProgramme(p);
      setEnrolments(ens);
      setExams(ex || []);
      setLiveSessions(live || []);
      const prog = await api.get<{ completed_lesson_ids: string[] }>(`/progress/programme/${programmeId}`);
      setCompleted(prog.completed_lesson_ids || []);
      const first = p.subjects?.flatMap((s) => s.lessons || [])[0];
      if (first) setActiveId(first.id);
    } catch (e) {
      setError("Unable to load programme");
    } finally {
      setLoading(false);
    }
  }, [programmeId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingBlock />;
  if (!programme) return <div className="container-x py-16"><Alert type="error">{error || "Not found"}</Alert></div>;

  const lessons = programme.subjects?.flatMap((s) => s.lessons || []) || [];
  const active = lessons.find((l) => l.id === activeId) || lessons[0];
  const now = Date.now();
  const activeEnrols = enrolments.filter((e) => e.programme_id === programme.id && e.status === "active");
  const fullEnrol =
    activeEnrols.find((e) => !e.scope_key || e.scope_key === "programme") ||
    enrolments.find((e) => e.programme_id === programme.id && (!e.scope_key || e.scope_key === "programme")) ||
    null;
  const enrolment = fullEnrol || activeEnrols[0] || enrolments.find((e) => e.programme_id === programme.id) || null;
  const progress = enrolment?.progress_percent || 0;
  const isEnrolled = activeEnrols.some((e) => !e.access_expires_at || new Date(e.access_expires_at).getTime() > now);
  const subExpired = !!(fullEnrol?.access_expires_at && new Date(fullEnrol.access_expires_at).getTime() < now);
  const subExpiringSoon =
    !subExpired && !!(fullEnrol?.access_expires_at && new Date(fullEnrol.access_expires_at).getTime() - now < 3 * 86400000);
  const upcomingLive = liveSessions.filter((s) => {
    if (!s.start_time) return true;
    const start = new Date(s.start_time).getTime();
    const end = start + (s.duration_min || 60) * 60000;
    return end + 30 * 60000 > now && s.status !== "ended" && s.status !== "cancelled";
  });
  const liveByLesson = new Map<string, LiveSession>();
  for (const s of upcomingLive) if (s.lesson_id) liveByLesson.set(s.lesson_id, s);
  const featuredLive = (active && liveByLesson.get(active.id)) || upcomingLive[0];
  const activeSubject = active ? programme.subjects?.find((s) => (s.lessons || []).some((l) => l.id === active.id)) : undefined;
  const pricingMode = programme.pricing_mode || "once";
  const needsUnlock = !!active && !active.locked && active.purchased === false;

  const purchase = async (
    scope_type: "subject" | "lesson",
    scope_id: string,
    price: number,
    method?: "manual" | "paypal",
    promo?: string | null,
  ) => {
    const m = method || (price > 0 ? "manual" : "free");
    setBusy(true);
    setError("");
    try {
      const en = await api.post<Enrolment>("/enrolments", {
        programme_id: programme.id,
        scope_type,
        scope_id,
        method: m,
        promo_code: promo || undefined,
      });
      if (m === "paypal") {
        const order = await api.post<{ approve_url?: string }>("/payments/paypal/create-order", {
          purpose: "enrolment",
          target_id: en.id,
          return_url: window.location.origin,
          cancel_url: window.location.origin,
        });
        if (order.approve_url) {
          window.location.href = order.approve_url;
          return;
        }
      }
      if (m === "manual") {
        navigate("/dashboard/payments");
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Purchase failed");
    } finally {
      setBusy(false);
    }
  };

  const renewSubscription = async (method: "manual" | "paypal", promo?: string | null) => {
    setBusy(true);
    setError("");
    try {
      const en = await api.post<Enrolment>("/enrolments", {
        programme_id: programme.id,
        method,
        promo_code: promo || undefined,
      });
      if (method === "paypal") {
        const order = await api.post<{ approve_url?: string }>("/payments/paypal/create-order", {
          purpose: "enrolment",
          target_id: en.id,
          return_url: window.location.origin,
          cancel_url: window.location.origin,
        });
        if (order.approve_url) {
          window.location.href = order.approve_url;
          return;
        }
      }
      navigate("/dashboard/payments");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Renewal failed");
    } finally {
      setBusy(false);
    }
  };

  const joinLive = async (s: LiveSession) => {
    setJoining(s.id);
    setJoinError("");
    try {
      const res = await api.post<{ join_url: string }>(`/live-sessions/${s.id}/join`, {});
      if (res.join_url) window.open(res.join_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setJoinError(e instanceof ApiError ? e.message : "Could not open live class. Enrolment required.");
    } finally {
      setJoining(null);
    }
  };

  const markComplete = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await api.post("/progress/complete", { lesson_id: active.id, programme_id: programme.id });
      setCompleted((c) => (c.includes(active.id) ? c : [...c, active.id]));
      const ens = await api.get<Enrolment[]>("/enrolments/mine");
      setEnrolments(ens);
    } catch (e) {
      setError("Could not mark complete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-bg">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-80 transform border-r border-border bg-surface transition-transform lg:static lg:translate-x-0 ${
          sidebar ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <button className="lg:hidden" onClick={() => setSidebar(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-border p-4">
          <p className="text-sm font-bold">{programme.title}</p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1.5">
            <ProgressBar value={progress} />
          </div>
        </div>
        <nav className="overflow-y-auto p-3" style={{ height: "calc(100vh - 140px)" }}>
          {(programme.subjects || []).map((s) => (
            <div key={s.id} className="mb-4">
              <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-muted">{s.title}</p>
              {(s.lessons || []).map((l) => {
                const done = completed.includes(l.id);
                const isActive = active?.id === l.id;
                const isLocked = !!l.locked;
                const needsUnlock = l.purchased === false;
                const hasLive = liveByLesson.has(l.id);
                const opensAt = l.available_at ? new Date(l.available_at) : null;
                const overdue = !!l.due_at && new Date(l.due_at).getTime() < now && !done;
                return (
                  <button
                    key={l.id}
                    onClick={() => {
                      setActiveId(l.id);
                      setSidebar(false);
                    }}
                    className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                      isActive ? "bg-primary/10 font-semibold text-primary" : "text-muted hover:bg-surface2"
                    }`}
                  >
                    {isLocked ? (
                      <span title={opensAt ? `Opens ${opensAt.toLocaleString()}` : "Locked"}>🔒</span>
                    ) : needsUnlock ? (
                      <Unlock className="h-4 w-4 shrink-0 text-warning" />
                    ) : done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0" />
                    )}
                    <span className="line-clamp-2 flex-1">{l.title}</span>
                    {hasLive && <Video className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    {overdue && <span className="shrink-0 text-[10px] font-bold uppercase text-danger">Overdue</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {isEnrolled && upcomingLive.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-muted">Live Classes</p>
              {upcomingLive.map((s) => (
                <div key={s.id} className="mb-1 rounded-lg bg-surface2 px-2.5 py-2 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <Video className="h-4 w-4 shrink-0 text-primary" />
                    <span className="line-clamp-2">{s.title}</span>
                  </p>
                  {s.start_time && (
                    <p className="mt-0.5 text-xs text-muted">
                      {new Date(s.start_time).toLocaleString()}
                      {s.recurrence && s.recurrence !== "none" && ` · ${s.recurrence}`}
                    </p>
                  )}
                  <button
                    className="btn-primary mt-1.5 h-8 w-full justify-center text-xs"
                    onClick={() => joinLive(s)}
                    disabled={joining === s.id}
                  >
                    {joining === s.id ? "Opening..." : "Join Live"}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 border-t border-border pt-3">
            <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-muted">Examinations</p>
            {exams.length === 0 && <p className="px-2 py-1 text-xs text-muted">No exams yet</p>}
            {exams.map((ex) => (
              <Link
                key={ex.id}
                to={`/dashboard/exams/${ex.id}/take`}
                className="mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface2"
              >
                <GraduationCap className="h-4 w-4 text-primary" />
                {ex.title}
              </Link>
            ))}
          </div>
        </nav>
      </aside>

      <div className="flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setSidebar(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <p className="hidden font-semibold lg:block">{active?.title || programme.title}</p>
          <div className="flex items-center gap-2">
            <Badge status={enrolment?.status || "active"} />
            <Link to={`/programmes/${programme.slug}`} className="btn-ghost text-xs">
              Overview
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-4xl p-6">
          {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
          {joinError && <div className="mb-4"><Alert type="error">{joinError}</Alert></div>}

          {subExpired && (
            <div className="mb-4">
              <Alert type="error">
                <span className="flex flex-wrap items-center justify-between gap-3">
                  <span>Your subscription expired on {fullEnrol?.access_expires_at ? new Date(fullEnrol.access_expires_at).toLocaleDateString() : "—"}.</span>
                  <span className="flex gap-2">
                    <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={() => renewSubscription("manual", renewPromo)}>
                      Renew (manual transfer)
                    </button>
                    <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => renewSubscription("paypal", renewPromo)}>
                      PayPal
                    </button>
                  </span>
                </span>
              </Alert>
              <div className="rounded-b-2xl border border-t-0 border-border bg-surface px-4 pb-4">
                <PromoQuote programmeId={programme.id} onQuote={(q) => setRenewPromo(q?.promo_code ?? null)} />
              </div>
            </div>
          )}
          {!subExpired && subExpiringSoon && (
            <div className="mb-4">
              <Alert type="warning">
                Your subscription expires {fullEnrol?.access_expires_at ? new Date(fullEnrol.access_expires_at).toLocaleDateString() : ""} — renew to keep access.
              </Alert>
            </div>
          )}

          {isEnrolled && featuredLive && (
            <Card className="mb-6 border-primary/30 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-primary">
                    <Video className="h-4 w-4" /> Upcoming live class
                    {featuredLive.lesson_id && <Badge status="in_progress">Linked lesson</Badge>}
                  </p>
                  <p className="mt-1 font-extrabold">{featuredLive.title}</p>
                  {featuredLive.lesson_id && (
                    <p className="text-xs text-muted">For lesson: {lessons.find((l) => l.id === featuredLive.lesson_id)?.title}</p>
                  )}
                  {featuredLive.start_time && (
                    <p className="text-sm text-muted">
                      {new Date(featuredLive.start_time).toLocaleString()}
                      {featuredLive.recurrence && featuredLive.recurrence !== "none"
                        ? ` · repeats ${featuredLive.recurrence}`
                        : ""}
                    </p>
                  )}
                </div>
                <Button onClick={() => joinLive(featuredLive)} loading={joining === featuredLive.id}>
                  Join Live Class
                </Button>
              </div>
            </Card>
          )}

          {!isEnrolled && liveSessions.length > 0 && (
            <Alert type="error">
              Live classes are available after you enrol in this programme.
            </Alert>
          )}

          {active ? (
            <article className="card p-6 sm:p-8">
              <div className="flex items-center gap-2 text-sm text-muted">
                <FileText className="h-4 w-4" /> Lesson · {active.duration_min} min
                {active.locked && <span className="ml-1">🔒 Locked</span>}
                {!active.locked && needsUnlock && <Badge status="pending">Not purchased</Badge>}
                {active.due_at && new Date(active.due_at).getTime() < now && !completed.includes(active.id) && (
                  <Badge status="failed">Overdue — due {new Date(active.due_at).toLocaleString()}</Badge>
                )}
                {!active.locked && active.available_at && new Date(active.available_at).getTime() > now && (
                  <span>Opens {new Date(active.available_at).toLocaleString()}</span>
                )}
              </div>
              <h1 className="mt-2 text-2xl font-extrabold">{active.title}</h1>
              {active.locked ? (
                <div className="mt-6 rounded-2xl border border-border bg-surface2 p-8 text-center">
                  <p className="text-3xl">🔒</p>
                  <p className="mt-3 font-bold">This lesson is not available yet</p>
                  <p className="mt-1 text-sm text-muted">
                    {active.available_at
                      ? `Opens ${new Date(active.available_at).toLocaleString()}`
                      : "It will unlock when the course window begins."}
                  </p>
                </div>
              ) : needsUnlock ? (
                <div className="mt-6 rounded-2xl border border-border bg-surface2 p-8 text-center">
                  <p className="text-3xl"><Lock className="mx-auto h-8 w-8 text-warning" /></p>
                  <p className="mt-3 font-bold">This lesson is not purchased yet</p>
                  {pricingMode === "per_lesson" ? (
                    <>
                      <p className="mt-1 text-sm text-muted">
                        Unlock it for {programme.currency || "USD"} {active.price ?? 0} — permanent access.
                      </p>
                      <div className="mx-auto mt-3 max-w-sm text-left">
                        <PromoQuote
                          programmeId={programme.id}
                          scopeType="lesson"
                          scopeId={active.id}
                          onQuote={(q) => setUnlockPromo(q?.promo_code ?? null)}
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {(active.price ?? 0) > 0 ? (
                          <>
                            <Button loading={busy} onClick={() => purchase("lesson", active.id, active.price ?? 0, undefined, unlockPromo)}>
                              Unlock (manual transfer)
                            </Button>
                            <Button variant="ghost" loading={busy} onClick={() => purchase("lesson", active.id, active.price ?? 0, "paypal", unlockPromo)}>
                              PayPal
                            </Button>
                          </>
                        ) : (
                          <Button loading={busy} onClick={() => purchase("lesson", active.id, 0)}>
                            Unlock free
                          </Button>
                        )}
                      </div>
                    </>
                  ) : pricingMode === "per_module" && activeSubject ? (
                    <>
                      <p className="mt-1 text-sm text-muted">
                        Unlock the whole module “{activeSubject.title}” for {programme.currency || "USD"} {activeSubject.price ?? 0} —
                        permanent access.
                      </p>
                      <div className="mx-auto mt-3 max-w-sm text-left">
                        <PromoQuote
                          programmeId={programme.id}
                          scopeType="subject"
                          scopeId={activeSubject.id}
                          onQuote={(q) => setUnlockPromo(q?.promo_code ?? null)}
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {(activeSubject.price ?? 0) > 0 ? (
                          <>
                            <Button loading={busy} onClick={() => purchase("subject", activeSubject.id, activeSubject.price ?? 0, undefined, unlockPromo)}>
                              Unlock module (manual transfer)
                            </Button>
                            <Button variant="ghost" loading={busy} onClick={() => purchase("subject", activeSubject.id, activeSubject.price ?? 0, "paypal", unlockPromo)}>
                              PayPal
                            </Button>
                          </>
                        ) : (
                          <Button loading={busy} onClick={() => purchase("subject", activeSubject.id, 0)}>
                            Unlock module free
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-sm text-muted">Buy the full programme to access this lesson.</p>
                      <Link to={`/programmes/${programme.slug}`} className="btn-primary mt-4 inline-block">
                        View programme
                      </Link>
                    </>
                  )}
                  <p className="mt-3 text-xs text-muted">Manual payments are verified by the institute before access is granted.</p>
                </div>
              ) : (
                <>
                  {active.video_url && (
                    <div className="mt-5 overflow-hidden rounded-2xl border border-border">
                      {active.video_url.includes("youtube") || active.video_url.includes("youtu.be") ? (
                        <iframe
                          className="aspect-video w-full"
                          src={active.video_url.replace("watch?v=", "embed/")}
                          title="Lesson video"
                          allowFullScreen
                        />
                      ) : (
                        <video className="aspect-video w-full bg-black" controls src={active.video_url} />
                      )}
                    </div>
                  )}
                  <div className="prose-sm mt-6 whitespace-pre-line leading-relaxed text-muted">
                    {active.content || "No written content for this lesson."}
                  </div>
                  {(active.resources?.length || 0) > 0 && (
                    <div className="mt-6 rounded-xl border border-border bg-surface2 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted">Lesson resources</p>
                      <ul className="mt-2 space-y-1.5">
                        {active.resources!.map((m) => (
                          <li key={m.id}>
                            <a href={m.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                              <FileText className="h-4 w-4" /> {m.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(activeSubject?.resources?.length || 0) > 0 && (
                    <div className="mt-4 rounded-xl border border-border bg-surface2 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted">Module resources — {activeSubject?.title}</p>
                      <ul className="mt-2 space-y-1.5">
                        {activeSubject!.resources!.map((m) => (
                          <li key={m.id}>
                            <a href={m.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                              <FileText className="h-4 w-4" /> {m.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
              <div className="mt-8 flex flex-wrap gap-3 border-t border-border pt-6">
                <Button
                  onClick={markComplete}
                  loading={busy}
                  disabled={active.locked || needsUnlock}
                  variant={completed.includes(active.id) ? "ghost" : "primary"}
                >
                  {completed.includes(active.id) ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Completed
                    </>
                  ) : (
                    "Mark as complete"
                  )}
                </Button>
                {lessons.length > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const idx = lessons.findIndex((l) => l.id === active.id);
                      if (idx >= 0 && idx < lessons.length - 1) setActiveId(lessons[idx + 1].id);
                    }}
                  >
                    Next lesson
                  </Button>
                )}
              </div>
            </article>
          ) : (
            <EmptyNoLessons />
          )}

          {programme.materials && programme.materials.length > 0 && (
            <Card className="mt-6 p-6">
              <h2 className="font-bold">Study Materials</h2>
              <ul className="mt-3 space-y-2">
                {programme.materials.map((m) => (
                  <li key={m.id}>
                    <a href={m.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <FileText className="h-4 w-4" /> {m.title}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyNoLessons() {
  return (
    <Card className="p-10 text-center text-muted">No lessons published yet. Please check back soon.</Card>
  );
}
