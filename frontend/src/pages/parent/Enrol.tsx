import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { api } from "../../lib/api";
import type { Paged, ParentLink, Programme } from "../../lib/types";
import { Alert, Button, Card, Field, LoadingBlock, Select } from "../../components/ui";

export default function ParentEnrol() {
  const [children, setChildren] = useState<ParentLink[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [studentId, setStudentId] = useState("");
  const [programmeId, setProgrammeId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, p] = await Promise.all([
          api.get<Paged<ParentLink>>("/parents/children"),
          api.get<Paged<Programme>>("/programmes?status=published&size=100"),
        ]);
        const active = c.items.filter((l) => l.status === "active");
        setChildren(active);
        setProgrammes(p.items);
        if (active[0]) setStudentId(active[0].student_id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      await api.post("/parents/enrolments", {
        student_id: studentId,
        programme_id: programmeId,
        note: note.trim() || null,
      });
      setOk("Enrolment requested. The institute will review and approve it shortly.");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading..." />;

  if (children.length === 0) {
    return (
      <Card className="p-10 text-center">
        <CalendarCheck className="mx-auto h-10 w-10 text-muted" />
        <h1 className="mt-3 text-xl font-bold">No active children linked</h1>
        <p className="mt-2 text-sm text-muted">
          Add a child on the dashboard and wait for admin approval before enrolling them.
        </p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Enrol a Child</h1>
        <p className="mt-1 text-sm text-muted">
          Your request will be sent to the institute for approval.
        </p>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {ok && <Alert type="success">{ok}</Alert>}

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Child">
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="" disabled>
                Select a child
              </option>
              {children.map((c) => (
                <option key={c.id} value={c.student_id}>
                  {c.student?.name || c.student_id} ({c.student?.email})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Programme">
            <Select value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} required>
              <option value="" disabled>
                Select a programme
              </option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} {p.price ? `— LKR ${p.price}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note (optional)">
            <textarea
              className="input h-20 resize-none"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the institute should know..."
            />
          </Field>
          <Button type="submit" loading={busy} disabled={!studentId || !programmeId} className="w-full">
            Request enrolment
          </Button>
        </form>
      </Card>
    </div>
  );
}
