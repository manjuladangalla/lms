import { useEffect, useRef, useState } from "react";
import { api, ApiError, publicFileUrl } from "../../lib/api";
import type { Banner } from "../../lib/types";
import { BANNER_THEMES, bannerTheme } from "../../lib/banners";
import { Alert, Badge, Button, Field, Input, LoadingBlock, Modal, Select, Table, Textarea } from "../../components/ui";
import { ImagePlus } from "lucide-react";

const empty = {
  title: "",
  subtitle: "",
  cta_text: "",
  link_url: "",
  image_url: "",
  theme: "ocean",
  sort_order: 0,
  active: true,
};

export default function AdminBanners() {
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await api.get<Banner[]>("/banners?active_only=false"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("prefix", "banners");
      const res = await api.upload<{ url: string }>("/upload", fd);
      setForm((f) => ({ ...f, image_url: res.url }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    setBusy(true);
    setError("");
    const payload = {
      title: form.title,
      subtitle: form.subtitle,
      cta_text: form.cta_text,
      link_url: form.link_url,
      image_url: form.image_url || null,
      theme: form.theme,
      sort_order: Number(form.sort_order),
      active: form.active,
    };
    try {
      if (editId) await api.put(`/banners/${editId}`, payload);
      else await api.post("/banners", payload);
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
    if (!confirm("Delete banner?")) return;
    try {
      await api.delete(`/banners/${id}`);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Banners</h1>
          <p className="text-sm text-muted">Colorful promotional banners shown in the homepage carousel — updated live.</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ ...empty }); setOpen(true); }}>New Banner</Button>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <Table headers={["Preview", "Title", "Theme", "Sort", "Status", "Actions"]}>
          {items.map((b) => (
            <tr key={b.id} className="hover:bg-surface2/50">
              <td className="px-4 py-3">
                <div className={`h-12 w-40 overflow-hidden rounded-lg bg-gradient-to-r ${bannerTheme(b.theme).className}`}>
                  {b.image_url && (
                    <img src={(publicFileUrl(b.image_url ?? undefined) || undefined)} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium">{b.title || "—"}</div>
                <div className="text-xs text-muted">{b.subtitle}</div>
              </td>
              <td className="px-4 py-3">{bannerTheme(b.theme).label}</td>
              <td className="px-4 py-3">{b.sort_order ?? 0}</td>
              <td className="px-4 py-3">
                <Badge status={b.active ? "active" : "draft"} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => {
                      setEditId(b.id);
                      setForm({
                        title: b.title || "",
                        subtitle: b.subtitle || "",
                        cta_text: b.cta_text || "",
                        link_url: b.link_url || "",
                        image_url: b.image_url || "",
                        theme: b.theme || "ocean",
                        sort_order: b.sort_order ?? 0,
                        active: b.active !== false,
                      });
                      setOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => remove(b.id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No banners yet.</td></tr>
          )}
        </Table>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? "Edit Banner" : "New Banner"}>
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
        <div className="space-y-4">
          <div
            className={`h-32 w-full rounded-xl bg-gradient-to-r ${bannerTheme(form.theme).className} overflow-hidden`}
          >
            {form.image_url && (
              <img src={(publicFileUrl(form.image_url ?? undefined) || undefined)} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Theme">
              <Select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
                {Object.entries(BANNER_THEMES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Subtitle">
            <Textarea rows={2} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Button text" hint="Blank = no button">
              <Input value={form.cta_text} onChange={(e) => setForm({ ...form, cta_text: e.target.value })} />
            </Field>
            <Field label="Button link" hint="/courses, /programmes/…">
              <Input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sort order" hint="Lower shows first">
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </Field>
            <Field label="Status">
              <Select value={form.active ? "active" : "hidden"} onChange={(e) => setForm({ ...form, active: e.target.value === "active" })}>
                <option value="active">Active</option>
                <option value="hidden">Hidden</option>
              </Select>
            </Field>
          </div>
          <div>
            <p className="label mb-2">Background image (optional)</p>
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage(f);
                }}
              />
              <Button variant="ghost" loading={uploading} onClick={() => fileRef.current?.click()}>
                <ImagePlus className="h-4 w-4" /> Upload image
              </Button>
              {form.image_url && (
                <button
                  className="text-xs text-danger"
                  onClick={() => setForm({ ...form, image_url: "" })}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={busy} disabled={!form.title} onClick={save}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
