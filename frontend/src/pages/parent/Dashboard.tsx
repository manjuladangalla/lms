import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Baby, CalendarCheck, CheckCircle2, TrendingUp, XCircle } from "lucide-react";
import { api } from "../../lib/api";
import type { Enrolment, Paged, ParentLink } from "../../lib/types";
import { Alert, Badge, Button, Card, Field, Input, LoadingBlock } from "../../components/ui";

export default function ParentDashboard() {
  const [links, setLinks] = useState<ParentLink[]>([]);
  const [pending, setPending] = useState<Enrolment[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [childrenRes, awaitRes] = await Promise.all([
        api.get<Paged<ParentLink>>("/parents/children"),
        api.get<Paged<Enrolment>>("/parents/enrolments/awaiting"),
      ]);
      setLinks(childrenRes.items);
      setPending(awaitRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addChild = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      await api.post("/parents/children", { email: email.trim() });
      setOk("Link request sent. It will be activated after admin approval.");
      setEmail("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add child");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, action: "accept" | "decline") => {
    try {
      await api.post(`/enrolments/${id}/${action}`, { reason: null });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  if (loading) return <LoadingBlock label="Loading your children..." />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">My Children</h1>
        <p className="mt-1 text-sm text-muted">Manage linked students and enrolment requests.</p>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {ok && <Alert type="success">{ok}</Alert>}

      {pending.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <CheckCircle2 className="h-5 w-5 text-primary" /> Enrolments awaiting your decision
          </h2>
          <div className="space-y-3">
            {pending.map((e) => (
              <div key={e.id} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold">{e.programme?.title || e.programme_id}</div>
                  <div className="text-xs text-muted">
                    Student: {e.student?.name || e.user_id} · requested by {e.requested_by_user?.name || "staff"}
                  </div>
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

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-bold">Add a child</h2>
        <form onSubmit={addChild} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Student's email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
              />
            </Field>
          </div>
          <Button type="submit" loading={busy} className="sm:w-auto">
            Send link request
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted">
          The link activates once an admin approves it. Demo pair: parent@example.com / student@example.com.
        </p>
      </Card>

      {links.length === 0 ? (
        <Card className="p-10 text-center">
          <Baby className="mx-auto h-10 w-10 text-muted" />
          <p className="mt-3 text-muted">No children linked yet. Add one above.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {links.map((l) => (
            <Card key={l.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold">{l.student?.name || l.student_id}</div>
                  <div className="text-xs text-muted">{l.student?.email}</div>
                </div>
                <Badge status={l.status} />
              </div>
              <div className="mt-4 flex gap-4 text-sm">
                <div>
                  <div className="text-lg font-bold text-primary">{l.student?.active_enrolments ?? 0}</div>
                  <div className="text-xs text-muted">Active</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-amber-600">{l.student?.pending_enrolments ?? 0}</div>
                  <div className="text-xs text-muted">Pending</div>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <Link to={`/parent/children/${l.student_id}`} className="btn-primary w-full justify-center">
                  <TrendingUp className="h-4 w-4" /> Progress & certificates
                </Link>
                <Link to="/parent/enrol" className="btn-ghost w-full justify-center">
                  <CalendarCheck className="h-4 w-4" /> Enrol in a programme
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
