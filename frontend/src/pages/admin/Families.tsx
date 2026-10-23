import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Paged, ParentLink } from "../../lib/types";
import { Alert, Badge, Button, Card, Field, Input, LoadingBlock, Modal, Pagination, Table, Textarea } from "../../components/ui";

export default function AdminFamilies() {
  const [data, setData] = useState<Paged<ParentLink> | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [parentEmail, setParentEmail] = useState("");
  const [studentEmail, setStudentEmail] = useState("");

  const [reasonTarget, setReasonTarget] = useState<ParentLink | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: "15" });
      if (status) params.set("status", status);
      setData(await api.get<Paged<ParentLink>>(`/parents/links?${params}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load links");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status, page]);

  const decide = async (id: string, next: "active" | "rejected" | "revoked") => {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/parents/links/${id}`, {
        status: next,
        reason: next === "active" ? null : reason || null,
      });
      setReasonTarget(null);
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/parents/links", {
        parent_email: parentEmail.trim(),
        student_email: studentEmail.trim(),
      });
      setCreateOpen(false);
      setParentEmail("");
      setStudentEmail("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Families</h1>
          <p className="text-sm text-muted">Approve and manage parent–student links.</p>
        </div>
        <Button onClick={() => { setCreateOpen(true); setError(""); }}>+ Link parent & student</Button>
      </div>

      {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}

      <div className="mb-4 flex flex-wrap gap-2">
        {["", "pending", "active", "rejected", "revoked"].map((s) => (
          <Button
            key={s}
            variant={status === s ? "primary" : "ghost"}
            onClick={() => { setStatus(s); setPage(1); }}
          >
            {s || "All"}
          </Button>
        ))}
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Table headers={["Parent", "Student", "Active enrolments", "Pending", "Status", "Created", "Actions"]}>
            {(data?.items || []).map((l) => (
              <tr key={l.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3">
                  <p className="font-medium">{l.parent?.name || "—"}</p>
                  <p className="text-xs text-muted">{l.parent?.email}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{l.student?.name || "—"}</p>
                  <p className="text-xs text-muted">{l.student?.email}</p>
                </td>
                <td className="px-4 py-3">{l.student?.active_enrolments ?? 0}</td>
                <td className="px-4 py-3">{l.student?.pending_enrolments ?? 0}</td>
                <td className="px-4 py-3"><Badge status={l.status} /></td>
                <td className="px-4 py-3 text-muted">
                  {l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  {l.status === "pending" ? (
                    <div className="flex gap-2">
                      <Button onClick={() => decide(l.id, "active")} disabled={busy}>Approve</Button>
                      <Button variant="danger" onClick={() => { setReasonTarget(l); setReason(""); }} disabled={busy}>Reject</Button>
                    </div>
                  ) : l.status === "active" ? (
                    <Button variant="soft" onClick={() => { setReasonTarget(l); setReason(""); }}>
                      Revoke
                    </Button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={data?.page || 1} total={data?.total || 0} size={data?.size || 15} onPage={setPage} />
        </>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Link parent & student">
        <form onSubmit={create} className="space-y-4">
          <Field label="Parent's email" hint="Parent account must already exist (role: parent).">
            <Input type="email" required value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="parent@example.com" />
          </Field>
          <Field label="Student's email">
            <Input type="email" required value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} placeholder="student@example.com" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create link</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!reasonTarget}
        onClose={() => setReasonTarget(null)}
        title={reasonTarget?.status === "active" ? "Revoke link" : "Reject link"}
      >
        <div className="space-y-4">
          <Card className="p-4 text-sm">
            <p className="font-semibold">{reasonTarget?.parent?.name} ↔ {reasonTarget?.student?.name}</p>
          </Card>
          <div>
            <label className="label">Reason (optional)</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setReasonTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => reasonTarget && decide(reasonTarget.id, reasonTarget.status === "active" ? "revoked" : "rejected")}
          >
            {reasonTarget?.status === "active" ? "Revoke" : "Reject"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
