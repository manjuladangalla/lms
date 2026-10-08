import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Paged, Payment } from "../../lib/types";
import { useAuth } from "../../store/auth";
import { Alert, Badge, Button, Card, Input, LoadingBlock, Modal, Pagination, Select, Table, Textarea } from "../../components/ui";
import { useRealtime } from "../../lib/realtime";

export default function AdminPayments() {
  const { settings } = useAuth();
  const [data, setData] = useState<Paged<Payment> | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Payment | null>(null);
  const [decision, setDecision] = useState<"succeeded" | "failed" | "refunded">("succeeded");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: "15" });
      if (status) params.set("status", status);
      setData(await api.get<Paged<Payment>>(`/payments?${params}`));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status, page]);

  useRealtime((event) => {
    if (event === "payment.created" || event === "payment.updated") load(true);
  });

  const verify = async () => {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/payments/${target.id}/verify`, { status: decision, notes });
      setTarget(null);
      setNotes("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Payments</h1>
          <p className="text-sm text-muted">Verify manual transfers and monitor PayPal payments.</p>
        </div>
        <Badge status="awaiting_verification">
          {(data?.items || []).filter((p) => p.status === "awaiting_verification").length} awaiting
        </Badge>
      </div>

      {settings?.manual_payment_instructions && (
        <Card className="mb-4 p-4 text-sm text-muted">
          <b className="text-ink">Manual instructions given to students:</b>
          <p className="mt-1 whitespace-pre-line">{settings.manual_payment_instructions}</p>
        </Card>
      )}

      <div className="mb-4">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-56">
          <option value="">All statuses</option>
          <option value="awaiting_verification">Awaiting verification</option>
          <option value="pending">Pending (PayPal)</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </Select>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Table headers={["User", "Amount", "Purpose", "Provider", "Status", "Proof", "Actions"]}>
            {(data?.items || []).map((p) => (
              <tr key={p.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3">
                  <p className="font-medium">{p.user?.name || "—"}</p>
                  <p className="text-xs text-muted">{p.user?.email}</p>
                </td>
                <td className="px-4 py-3 font-semibold">{p.currency} {p.amount}</td>
                <td className="px-4 py-3 capitalize">{p.purpose}</td>
                <td className="px-4 py-3 capitalize">{p.provider}</td>
                <td className="px-4 py-3"><Badge status={p.status} /></td>
                <td className="px-4 py-3">
                  {p.proof_url ? (
                    <a href={p.proof_url} target="_blank" rel="noreferrer" className="text-primary underline">View</a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.status === "awaiting_verification" || p.status === "pending" ? (
                    <Button variant="soft" onClick={() => setTarget(p)}>Verify</Button>
                  ) : p.notes ? (
                    <span className="text-xs text-muted">{p.notes}</span>
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

      <Modal open={!!target} onClose={() => setTarget(null)} title="Verify Payment">
        {error && <div className="mb-3"><Alert type="error">{error}</Alert></div>}
        <div className="space-y-3 text-sm">
          <p><b>Amount:</b> {target?.currency} {target?.amount}</p>
          <p><b>Provider:</b> {target?.provider}</p>
          <p><b>User:</b> {target?.user?.name} ({target?.user?.email})</p>
          {target?.proof_url && (
            <div>
              <p className="mb-1"><b>Proof:</b></p>
              <a href={target.proof_url} target="_blank" rel="noreferrer" className="text-primary underline">
                Open payment proof
              </a>
            </div>
          )}
          <div>
            <label className="label">Decision</label>
            <Select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
              <option value="succeeded">Approve — activate access</option>
              <option value="failed">Reject</option>
              <option value="refunded">Refunded</option>
            </Select>
          </div>
          <div>
            <label className="label">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
          <Button loading={busy} onClick={verify}>Confirm</Button>
        </div>
      </Modal>
    </div>
  );
}
