import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Programme, Promo } from "../../lib/types";
import { Alert, Badge, Button, Field, Input, LoadingBlock, Modal, Select, Table } from "../../components/ui";

const empty = {
  code: "",
  discount_percent: 25,
  scope: "all" as "all" | "programme",
  programme_id: "",
  start_date: "",
  end_date: "",
  max_uses: "",
  status: "active",
};

function toApiDate(date: string, end: boolean): string | null {
  if (!date) return null;
  return `${date}T${end ? "23:59:59" : "00:00:00"}Z`;
}
function fromDate(v?: string | null): string {
  return v ? String(v).slice(0, 10) : "";
}

export default function AdminPromos() {
  const [items, setItems] = useState<Promo[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [promos, progs] = await Promise.all([
        api.get<Promo[]>("/promos"),
        api.get<{ items: Programme[] }>("/programmes?size=100").catch(() => ({ items: [] })),
      ]);
      setItems(promos);
      setProgrammes(progs.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    const payload = {
      code: form.code.trim().toUpperCase(),
      discount_percent: Number(form.discount_percent),
      scope: form.scope,
      programme_id: form.scope === "programme" ? form.programme_id || null : null,
      starts_at: toApiDate(form.start_date, false),
      ends_at: toApiDate(form.end_date, true),
      max_uses: form.max_uses === "" ? null : Number(form.max_uses),
      status: form.status,
    };
    try {
      if (editId) await api.put(`/promos/${editId}`, payload);
      else await api.post("/promos", payload);
      setOpen(false);
      setForm({ ...empty });
      setEditId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete promo code?")) return;
    try {
      await api.delete(`/promos/${id}`);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  const programmeTitle = (id?: string | null) =>
    programmes.find((p) => p.id === id)?.title || "Unknown course";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Promotions</h1>
          <p className="text-sm text-muted">
            Time-limited promo codes — apply to all courses or a single course. Stacks on top of membership discounts.
          </p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ ...empty }); setOpen(true); }}>New Promo Code</Button>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <Table headers={["Code", "Discount", "Applies to", "Valid period", "Uses", "Status", "Actions"]}>
          {items.map((p) => {
            const expired = p.ends_at && new Date(p.ends_at).getTime() < Date.now();
            return (
              <tr key={p.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3 font-mono font-bold">{p.code}</td>
                <td className="px-4 py-3">
                  <Badge status="published">{p.discount_percent}% off</Badge>
                </td>
                <td className="px-4 py-3">
                  {p.scope === "all" ? "All courses" : programmeTitle(p.programme_id)}
                </td>
                <td className="px-4 py-3 text-sm text-muted">
                  {p.starts_at ? fromDate(p.starts_at) : "Now"} → {p.ends_at ? fromDate(p.ends_at) : "No end"}
                  {expired && <> <Badge status="expired" /></>}
                </td>
                <td className="px-4 py-3">
                  {p.used_count ?? 0}{p.max_uses != null ? ` / ${p.max_uses}` : ""}
                </td>
                <td className="px-4 py-3">
                  <Badge status={p.status === "active" ? "active" : "draft"} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      className="btn-ghost px-3 py-1.5 text-xs"
                      onClick={() => {
                        setEditId(p.id);
                        setForm({
                          code: p.code,
                          discount_percent: p.discount_percent,
                          scope: p.scope,
                          programme_id: p.programme_id || "",
                          start_date: fromDate(p.starts_at),
                          end_date: fromDate(p.ends_at),
                          max_uses: p.max_uses != null ? String(p.max_uses) : "",
                          status: p.status,
                        });
                        setOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => remove(p.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No promo codes yet.</td></tr>
          )}
        </Table>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? "Edit Promo Code" : "New Promo Code"}>
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code" hint="e.g. WELCOME25">
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="WELCOME25"
              />
            </Field>
            <Field label="Discount %">
              <Input
                type="number"
                min={1}
                max={100}
                value={form.discount_percent}
                onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date" hint="Blank = active now">
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="End date" hint="Blank = no expiry">
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Applies to">
              <Select
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value as "all" | "programme" })}
              >
                <option value="all">All courses</option>
                <option value="programme">One course</option>
              </Select>
            </Field>
            {form.scope === "programme" && (
              <Field label="Course">
                <Select value={form.programme_id} onChange={(e) => setForm({ ...form, programme_id: e.target.value })}>
                  <option value="">Select a course…</option>
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Max uses" hint="Blank = unlimited">
              <Input
                type="number"
                min={1}
                value={form.max_uses}
                onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!form.code || form.code.length < 3 || (form.scope === "programme" && !form.programme_id)}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}
