import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { ContactMessage, Paged } from "../../lib/types";
import { Badge, Button, LoadingBlock, Modal, Pagination, Select, Table, Textarea } from "../../components/ui";

export default function AdminMessages() {
  const [data, setData] = useState<Paged<ContactMessage> | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ContactMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: "15" });
      if (status) params.set("status_", status);
      setData(await api.get<Paged<ContactMessage>>(`/messages?${params.toString().replace("status_=", "status=")}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status, page]);

  const mark = async (id: string, s: string) => {
    setBusy(true);
    try {
      await api.patch(`/messages/${id}`, { status: s });
      setView(null);
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
        <h1 className="text-2xl font-extrabold">Contact Messages</h1>
        <p className="text-sm text-muted">Messages submitted from the Contact Us page.</p>
      </div>

      <div className="mb-4">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-48">
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="read">Read</option>
          <option value="replied">Replied</option>
        </Select>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Table headers={["From", "Subject", "Status", "Received", ""]}>
            {(data?.items || []).map((m) => (
              <tr key={m.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3">
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted">{m.email} {m.phone ? `· ${m.phone}` : ""}</p>
                </td>
                <td className="px-4 py-3">{m.subject || "—"}</td>
                <td className="px-4 py-3"><Badge status={m.status} /></td>
                <td className="px-4 py-3 text-muted">
                  {m.created_at ? new Date(m.created_at).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <Button variant="soft" onClick={() => setView(m)}>View</Button>
                </td>
              </tr>
            ))}
            {(data?.items || []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No messages.</td></tr>
            )}
          </Table>
          <Pagination page={data?.page || 1} total={data?.total || 0} size={data?.size || 15} onPage={setPage} />
        </>
      )}

      <Modal open={!!view} onClose={() => setView(null)} title={view?.subject || "Message"}>
        {view && (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl bg-surface2 p-4">
              <p className="font-semibold">{view.name}</p>
              <p className="text-muted">{view.email} {view.phone ? `· ${view.phone}` : ""}</p>
              <p className="mt-1 text-xs text-muted">
                {view.created_at ? new Date(view.created_at).toLocaleString() : ""}
              </p>
            </div>
            <div className="whitespace-pre-wrap">{view.message}</div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => mark(view.id, "read")}>Mark read</Button>
              <Button disabled={busy} onClick={() => mark(view.id, "replied")}>Mark replied</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
