import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { PageContent } from "../../lib/types";
import { Alert, Badge, Button, Field, Input, LoadingBlock, Modal, Table, Textarea } from "../../components/ui";

const known = [
  { slug: "home", label: "Home" },
  { slug: "about", label: "About Us" },
  { slug: "contact", label: "Contact Us" },
];

export default function AdminPages() {
  const [items, setItems] = useState<PageContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<PageContent | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await api.get<PageContent[]>("/pages"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openEdit = async (slug: string) => {
    setError("");
    try {
      const p = await api.get<PageContent>(`/pages/${slug}`);
      setEdit(p);
    } catch {
      setEdit({ slug, title: known.find((k) => k.slug === slug)?.label || slug, subtitle: "", body: "", sections: [], published: true });
    }
  };

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      await api.put(`/pages/${edit.slug}`, edit);
      setEdit(null);
      await load();
    } catch (e) {
      try {
        await api.post("/pages", edit);
        setEdit(null);
        await load();
      } catch (e2) {
        setError(e2 instanceof ApiError ? e2.message : "Save failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Pages</h1>
        <p className="text-sm text-muted">Content for Home, About and Contact pages.</p>
      </div>

      {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}

      {loading ? (
        <LoadingBlock />
      ) : (
        <Table headers={["Page", "Title", "Published", "Actions"]}>
          {known.map((k) => {
            const existing = items.find((i) => i.slug === k.slug);
            return (
              <tr key={k.slug}>
                <td className="px-4 py-3 font-medium">{k.label} <span className="text-xs text-muted">/{k.slug}</span></td>
                <td className="px-4 py-3">{existing?.title || "—"}</td>
                <td className="px-4 py-3">
                  {existing ? <Badge status={existing.published !== false ? "published" : "draft"} /> : <Badge status="draft">Missing</Badge>}
                </td>
                <td className="px-4 py-3">
                  <Button variant="soft" onClick={() => openEdit(k.slug)}>Edit</Button>
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Edit page: ${edit?.slug || ""}`} wide>
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
        {edit && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title">
                <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              </Field>
              <Field label="Subtitle">
                <Input value={edit.subtitle || ""} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} />
              </Field>
            </div>
            <Field label="Body" hint="Main content. Use blank lines between paragraphs.">
              <Textarea rows={8} value={edit.body || ""} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={edit.published !== false}
                onChange={(e) => setEdit({ ...edit, published: e.target.checked })}
              />
              Published
            </label>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
