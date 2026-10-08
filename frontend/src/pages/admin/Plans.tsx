import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { InstituteSettings, MembershipPlan } from "../../lib/types";
import { Alert, Badge, Button, Field, Input, LoadingBlock, Modal, Select, Table, Textarea } from "../../components/ui";

const empty = {
  name: "",
  description: "",
  discount_percent: 25,
  price: 5,
  yearly_price: 50 as number | null,
  currency: "",
  benefits: "",
  status: "active",
};

export default function AdminPlans() {
  const [items, setItems] = useState<MembershipPlan[]>([]);
  const [settings, setSettings] = useState<InstituteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const currencies = (settings?.currencies || settings?.currency || "USD")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const load = async () => {
    setLoading(true);
    try {
      const [plans, cfg] = await Promise.all([
        api.get<MembershipPlan[]>("/membership-plans?active_only=false"),
        api.get<InstituteSettings>("/settings").catch(() => null),
      ]);
      setItems(plans);
      setSettings(cfg);
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
      name: form.name,
      description: form.description,
      discount_percent: Number(form.discount_percent),
      price: Number(form.price),
      yearly_price: form.yearly_price === null ? null : Number(form.yearly_price),
      currency: form.currency || currencies[0] || "USD",
      benefits: form.benefits.split("\n").map((s) => s.trim()).filter(Boolean),
      status: form.status,
      sort_order: 0,
    };
    try {
      if (editId) await api.put(`/membership-plans/${editId}`, payload);
      else await api.post("/membership-plans", payload);
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
    if (!confirm("Delete plan?")) return;
    try {
      await api.delete(`/membership-plans/${id}`);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Membership Plans</h1>
          <p className="text-sm text-muted">Discount plans — members save the plan's % on every course fee.</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ ...empty }); setOpen(true); }}>New Plan</Button>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <Table headers={["Name", "Discount", "Monthly", "Yearly", "Currency", "Status", "Actions"]}>
          {items.map((p) => (
            <tr key={p.id} className="hover:bg-surface2/50">
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3">
                <Badge status="published">{p.discount_percent}% off</Badge>
              </td>
              <td className="px-4 py-3">{p.price}</td>
              <td className="px-4 py-3">{p.yearly_price ?? "—"}</td>
              <td className="px-4 py-3">{p.currency || "USD"}</td>
              <td className="px-4 py-3"><Badge status={p.status === "active" ? "active" : "draft"} /></td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => {
                      setEditId(p.id);
                      setForm({
                        name: p.name,
                        description: p.description || "",
                        discount_percent: p.discount_percent ?? 25,
                        price: p.price,
                        yearly_price: p.yearly_price ?? null,
                        currency: p.currency || currencies[0] || "USD",
                        benefits: (p.benefits || []).join("\n"),
                        status: p.status || "active",
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
          ))}
          {items.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No plans yet.</td></tr>
          )}
        </Table>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? "Edit Plan" : "New Plan"}>
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
        <div className="space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Discount off all courses" hint="25 / 50 / 75 / 100">
              <Select
                value={String(form.discount_percent)}
                onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })}
              >
                {[25, 50, 75, 100].map((d) => (
                  <option key={d} value={d}>{d}% off</option>
                ))}
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={form.currency || currencies[0] || "USD"} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Monthly price">
              <Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </Field>
            <Field label="Yearly price" hint="Blank = yearly billing disabled">
              <Input
                type="number"
                min={0}
                value={form.yearly_price ?? ""}
                onChange={(e) => setForm({ ...form, yearly_price: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Benefits (one per line)">
            <Textarea rows={4} value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="hidden">Hidden</option>
            </Select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={busy} disabled={!form.name} onClick={save}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
