import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import type { InstituteSettings, Paged, Programme } from "../../lib/types";
import { Alert, Badge, Button, Card, Field, Input, LoadingBlock, Modal, Pagination, Select, Table, Textarea } from "../../components/ui";
import { useRealtime } from "../../lib/realtime";

const emptyForm = {
  type: "course",
  title: "",
  summary: "",
  description: "",
  category: "",
  level: "Beginner",
  duration: "",
  price: 0,
  currency: "USD",
  pricing_mode: "once",
  billing_interval: "monthly",
  is_free: false,
  status: "draft",
  final_exam_required: false,
};

export default function AdminProgrammes() {
  const [data, setData] = useState<Paged<Programme> | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [currencies, setCurrencies] = useState<string[]>(["USD"]);

  useEffect(() => {
    api
      .get<InstituteSettings>("/settings")
      .then((s) => {
        const list = (s.currencies || s.currency || "USD")
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean);
        if (list.length) setCurrencies(list);
      })
      .catch(() => {});
  }, []);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: "10" });
      if (q) params.set("q", q);
      if (type) params.set("type", type);
      if (status) params.set("status", status);
      const r = await api.get<Paged<Programme>>(`/programmes?${params}`);
      setData(r);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [q, type, status, page]);

  useRealtime((event) => {
    if (event === "programmes.changed") load(true);
  });

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/programmes", {
        ...form,
        billing_interval: form.pricing_mode === "subscription" ? form.billing_interval : null,
      });
      setOpen(false);
      setForm({ ...emptyForm });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete programme and all its content?")) return;
    try {
      await api.delete(`/programmes/${id}`);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Already deleted elsewhere — refresh the list
        await load();
        return;
      }
      alert(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Programmes</h1>
          <p className="text-sm text-muted">Classes, courses and diploma programmes.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New Programme
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search programmes..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="w-40">
          <option value="">All types</option>
          <option value="class">Class</option>
          <option value="course">Course</option>
          <option value="diploma">Diploma</option>
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Table headers={["Title", "Type", "Price", "Status", "Actions"]}>
            {(data?.items || []).map((p) => (
              <tr key={p.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3">
                  <Link to={`/admin/programmes/${p.id}`} className="font-semibold text-primary hover:underline">
                    {p.title}
                  </Link>
                  <p className="text-xs text-muted">/{p.slug}</p>
                </td>
                <td className="px-4 py-3 capitalize">{p.type}</td>
                <td className="px-4 py-3">{p.is_free || p.price === 0 ? "Free" : `${p.currency || "USD"} ${p.price}`}</td>
                <td className="px-4 py-3"><Badge status={p.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link to={`/admin/programmes/${p.id}`} className="btn-ghost px-3 py-1.5 text-xs">
                      Manage
                    </Link>
                    <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => remove(p.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={data?.page || 1} total={data?.total || 0} size={data?.size || 10} onPage={setPage} />
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Create Programme" wide>
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="class">Class</option>
              <option value="course">Course</option>
              <option value="diploma">Diploma</option>
            </Select>
          </Field>
          <Field label="Title">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Web Development" />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </Field>
          <Field label="Level">
            <Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </Select>
          </Field>
          <Field label="Duration">
            <Input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="6 weeks" />
          </Field>
          <Field label="Price (0 = free)">
            <Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          </Field>
          <Field label="Currency">
            <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Pricing mode">
            <Select value={form.pricing_mode} onChange={(e) => setForm({ ...form, pricing_mode: e.target.value })}>
              <option value="once">One-time (lifetime access)</option>
              <option value="subscription">Time-limited access</option>
              <option value="per_module">Per module</option>
              <option value="per_lesson">Per lesson</option>
            </Select>
          </Field>
          {form.pricing_mode === "subscription" && (
            <Field label="Billing interval" hint="Access expires after each paid period">
              <Select value={form.billing_interval} onChange={(e) => setForm({ ...form, billing_interval: e.target.value })}>
                <option value="weekly">Weekly (7 days)</option>
                <option value="monthly">Monthly (30 days)</option>
                <option value="semester">Semester (4 months)</option>
                <option value="yearly">Yearly (12 months)</option>
              </Select>
            </Field>
          )}
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </Select>
          </Field>
          <div className="flex items-end gap-4 pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_free} onChange={(e) => setForm({ ...form, is_free: e.target.checked })} /> Free
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.final_exam_required} onChange={(e) => setForm({ ...form, final_exam_required: e.target.checked })} /> Final exam required for certificate
            </label>
          </div>
          <div className="sm:col-span-2">
            <Field label="Summary">
              <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={busy} onClick={create} disabled={!form.title}>Create</Button>
        </div>
      </Modal>
    </div>
  );
}
