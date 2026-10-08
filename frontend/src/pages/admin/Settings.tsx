import { useEffect, useRef, useState } from "react";
import { Image, Save, Upload } from "lucide-react";
import { api, ApiError, publicFileUrl } from "../../lib/api";
import type { InstituteSettings } from "../../lib/types";
import { useAuth } from "../../store/auth";
import { Alert, Button, Card, Field, Input, LoadingBlock, Textarea } from "../../components/ui";

export default function AdminSettings() {
  const { refreshSettings, settings } = useAuth();
  const [form, setForm] = useState<InstituteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<InstituteSettings>("/settings")
      .then(setForm)
      .finally(() => setLoading(false));
  }, []);

  const uploadImage = async (file: File, field: "logo_url" | "favicon_url") => {
    setUploading(field);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.upload<{ url: string }>("/upload?prefix=branding", fd);
      setForm((f) => (f ? { ...f, [field]: r.url } : f));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed (is storage configured?)");
    } finally {
      setUploading("");
    }
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api.put("/settings", form);
      await refreshSettings();
      setSuccess("Institute settings saved. Site name, logo and branding update instantly.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !form) return <LoadingBlock />;

  const logo = publicFileUrl(form.logo_url);
  const favicon = publicFileUrl(form.favicon_url);

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Institute Settings</h1>
          <p className="text-sm text-muted">
            Site name, logo, branding and contact details shown across the whole website.
          </p>
        </div>
        <Button loading={busy} onClick={save}>
          <Save className="h-4 w-4" /> Save changes
        </Button>
      </div>

      {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
      {success && <div className="mb-4"><Alert type="success">{success}</Alert></div>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "logo_url")}
      />
      <input
        ref={faviconRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "favicon_url")}
      />

      <Card className="mb-6 p-6">
        <h2 className="mb-4 flex items-center gap-2 font-bold">
          <Image className="h-5 w-5 text-primary" /> Identity
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Institute / Site name" hint="Shown in navbar, footer, titles and certificates">
            <Input value={form.site_name} onChange={(e) => setForm({ ...form, site_name: e.target.value })} />
          </Field>
          <Field label="Tagline">
            <Input value={form.tagline || ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
          </Field>
          <Field label="Primary color (hex)">
            <Input value={form.primary_color || ""} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} placeholder="#2563eb" />
          </Field>
          <Field label="Default currency" hint="Used when a course/plan has none">
            <Input value={form.currency || "USD"} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </Field>
          <Field label="Available currencies" hint="Comma-separated — selectable on courses & membership plans">
            <Input
              value={form.currencies || ""}
              onChange={(e) => setForm({ ...form, currencies: e.target.value })}
              placeholder="USD,EUR,GBP,LKR,INR"
            />
          </Field>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-dashed border-border p-5 text-center">
            <p className="label">Logo</p>
            {logo ? (
              <img src={logo} alt="Logo" className="mx-auto h-20 w-20 rounded-2xl object-contain" />
            ) : (
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-surface2 text-muted">No logo</div>
            )}
            <div className="mt-3 flex justify-center gap-2">
              <Button variant="ghost" loading={uploading === "logo_url"} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload logo
              </Button>
              {form.logo_url && (
                <Button variant="ghost" onClick={() => setForm({ ...form, logo_url: null })}>Remove</Button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">Recommended: square PNG/SVG, max 2MB</p>
          </div>

          <div className="rounded-2xl border border-dashed border-border p-5 text-center">
            <p className="label">Favicon</p>
            {favicon ? (
              <img src={favicon} alt="Favicon" className="mx-auto h-16 w-16 rounded-lg object-contain" />
            ) : (
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-surface2 text-muted">Default</div>
            )}
            <div className="mt-3 flex justify-center gap-2">
              <Button variant="ghost" loading={uploading === "favicon_url"} onClick={() => faviconRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload favicon
              </Button>
              {form.favicon_url && (
                <Button variant="ghost" onClick={() => setForm({ ...form, favicon_url: null })}>Remove</Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 font-bold">Home page hero</h2>
        <div className="space-y-4">
          <Field label="Hero title">
            <Input value={form.home_hero_title || ""} onChange={(e) => setForm({ ...form, home_hero_title: e.target.value })} />
          </Field>
          <Field label="Hero subtitle">
            <Textarea value={form.home_hero_subtitle || ""} onChange={(e) => setForm({ ...form, home_hero_subtitle: e.target.value })} />
          </Field>
          <Field label="About body (fallback if About page empty)">
            <Textarea rows={4} value={form.about_body || ""} onChange={(e) => setForm({ ...form, about_body: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 font-bold">Contact details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact email">
            <Input value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </Field>
          <Field label="Contact phone">
            <Input value={form.contact_phone || ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <Textarea rows={2} value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(["facebook", "youtube", "linkedin", "instagram"] as const).map((k) => (
            <Field key={k} label={`${k[0].toUpperCase()}${k.slice(1)} URL`}>
              <Input value={(form[k] as string) || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 font-bold">Payments</h2>
        <Field
          label="Manual payment instructions"
          hint="Bank/wallet details students should transfer to before uploading proof"
        >
          <Textarea
            rows={5}
            value={form.manual_payment_instructions || ""}
            onChange={(e) => setForm({ ...form, manual_payment_instructions: e.target.value })}
            placeholder={"Bank: Example Bank\nAccount: 1234567890\nHolder: Institute Name"}
          />
        </Field>
        <p className="mt-3 text-xs text-muted">
          PayPal {settings?.paypal_configured ? "is configured ✓" : "is not configured (set PAYPAL_* env variables)"}.
          Payment gateway charges are billed separately by the provider.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-bold">Certificates & footer</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Certificate issuer name" hint="Defaults to site name">
            <Input value={form.certificate_issuer || ""} onChange={(e) => setForm({ ...form, certificate_issuer: e.target.value })} />
          </Field>
          <Field label="Footer text">
            <Input value={form.footer_text || ""} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-4 mt-6 flex justify-end">
        <Button loading={busy} onClick={save} className="shadow-soft">
          <Save className="h-4 w-4" /> Save changes
        </Button>
      </div>
    </div>
  );
}
