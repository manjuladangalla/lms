import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Enrolment, Paged } from "../../lib/types";
import { Badge, Button, Card, Input, LoadingBlock, Modal, Pagination, Select, Table, Textarea } from "../../components/ui";
import { useRealtime } from "../../lib/realtime";

export default function AdminEnrolments() {
  const [data, setData] = useState<Paged<Enrolment> | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Enrolment | null>(null);
  const [newStatus, setNewStatus] = useState("active");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: "15" });
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      setData(await api.get<Paged<Enrolment>>(`/enrolments?${params}`));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status, q, page]);

  useRealtime((event) => {
    if (event === "enrolment.created" || event === "enrolment.updated") load(true);
  });

  const save = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.patch(`/enrolments/${target.id}`, { status: newStatus, reason });
      setTarget(null);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Enrolments</h1>
        <p className="text-sm text-muted">Manage student access to programmes.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search student or course..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-52">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_verification">Pending verification</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
          <option value="revoked">Revoked</option>
        </Select>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Table headers={["Student", "Programme", "Progress", "Source", "Status", "Date", "Actions"]}>
            {(data?.items || []).map((e) => (
              <tr key={e.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3">
                  <p className="font-medium">{e.student?.name || "—"}</p>
                  <p className="text-xs text-muted">{e.student?.email}</p>
                </td>
                <td className="px-4 py-3">{e.programme?.title || e.programme_id}</td>
                <td className="px-4 py-3">{e.progress_percent || 0}%</td>
                <td className="px-4 py-3 capitalize">{e.source}</td>
                <td className="px-4 py-3"><Badge status={e.status} /></td>
                <td className="px-4 py-3 text-muted">
                  {(e as unknown as { created_at?: string }).created_at
                    ? new Date((e as unknown as { created_at: string }).created_at).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <Button variant="soft" onClick={() => { setTarget(e); setNewStatus(e.status); }}>
                    Manage
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={data?.page || 1} total={data?.total || 0} size={data?.size || 15} onPage={setPage} />
        </>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title="Update Enrolment">
        <div className="space-y-4">
          <Card className="p-4 text-sm">
            <p className="font-semibold">{target?.student?.name}</p>
            <p className="text-muted">{target?.programme?.title}</p>
            <p className="mt-1 text-muted">Progress: {target?.progress_percent || 0}%</p>
          </Card>
          <div>
            <label className="label">Status</label>
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              <option value="active">Active (grant access)</option>
              <option value="pending_verification">Pending verification</option>
              <option value="revoked">Revoked</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </Select>
          </div>
          <div>
            <label className="label">Reason / notes</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
