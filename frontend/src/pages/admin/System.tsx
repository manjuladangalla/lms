import { useEffect, useState } from "react";
import { Cloud, Database, Mail, Save, Server, Zap } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import type { SystemConfig } from "../../lib/types";
import { Alert, Button, Card, Field, Input, LoadingBlock, Select } from "../../components/ui";

type Tab = "storage" | "zoom" | "google" | "mail";

export default function AdminSystem() {
  const [cfg, setCfg] = useState<SystemConfig | null>(null);
  const [tab, setTab] = useState<Tab>("storage");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [zoomSecret, setZoomSecret] = useState("");
  const [googleSecret, setGoogleSecret] = useState("");
  const [mailPassword, setMailPassword] = useState("");
  const [s3Secret, setS3Secret] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState("");

  useEffect(() => {
    api
      .get<SystemConfig>("/system/config")
      .then(setCfg)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const save = async (section: Tab) => {
    if (!cfg) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const body: Record<string, unknown> = {};
      if (section === "storage") {
        body.storage = {
          ...cfg.storage,
          s3_secret_key: s3Secret === "" ? (cfg.storage.s3_secret_key_set ? null : "") : s3Secret,
        };
        delete (body.storage as Record<string, unknown>).test;
        delete (body.storage as Record<string, unknown>).s3_secret_key_set;
      } else if (section === "zoom") {
        body.zoom = {
          ...cfg.zoom,
          client_secret: zoomSecret === "" ? (cfg.zoom.client_secret_set ? null : "") : zoomSecret,
        };
        delete (body.zoom as Record<string, unknown>).client_secret_set;
      } else if (section === "google") {
        body.google = {
          ...cfg.google,
          client_secret: googleSecret === "" ? (cfg.google.client_secret_set ? null : "") : googleSecret,
        };
        delete (body.google as Record<string, unknown>).client_secret_set;
      } else {
        body.mail = {
          ...cfg.mail,
          password: mailPassword === "" ? (cfg.mail.password_set ? null : "") : mailPassword,
        };
        delete (body.mail as Record<string, unknown>).password_set;
      }
      const updated = await api.put<SystemConfig>("/system/config", body);
      setCfg(updated);
      setZoomSecret("");
      setGoogleSecret("");
      setMailPassword("");
      setS3Secret("");
      setSuccess(`${section} configuration saved.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const testMail = async () => {
    setBusy(true);
    setTestResult("");
    setError("");
    try {
      await api.post("/system/config/test-mail", { to: testTo });
      setTestResult(`Test email sent to ${testTo}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Test failed");
    } finally {
      setBusy(false);
    }
  };

  const testStorage = async () => {
    setBusy(true);
    setTestResult("");
    setError("");
    try {
      const r = await api.post<{ url: string; backend: string }>("/system/config/test-storage");
      setTestResult(`Test file saved via ${r.backend}: ${r.url}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Test failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !cfg) return <LoadingBlock />;

  const tabs: [Tab, string, typeof Cloud][] = [
    ["storage", "File Storage", Database],
    ["zoom", "Zoom", Zap],
    ["google", "Google", Cloud],
    ["mail", "Mail Server", Mail],
  ];

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">System Configuration</h1>
        <p className="text-sm text-muted">
          Super admin settings for integrations. Values saved here override environment variables.
          Secrets are write-only — leave a secret blank to keep the saved value.
        </p>
      </div>

      {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
      {success && <div className="mb-4"><Alert type="success">{success}</Alert></div>}
      {testResult && <div className="mb-4"><Alert type="info">{testResult}</Alert></div>}

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(""); setSuccess(""); }}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "storage" && (
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2 text-sm text-muted">
            <Server className="h-4 w-4" />
            Current: <b className="capitalize">{cfg.storage.backend}</b>
            {cfg.storage.test && (
              <span className={cfg.storage.test.ready ? "text-success" : "text-danger"}>
                · {cfg.storage.test.ready ? "ready" : "not configured"}
              </span>
            )}
          </div>
          <Field label="Storage backend">
            <Select
              value={cfg.storage.backend}
              onChange={(e) => setCfg({ ...cfg, storage: { ...cfg.storage, backend: e.target.value as "local" | "s3" } })}
            >
              <option value="local">Local disk (saved on server, served at /media)</option>
              <option value="s3">S3-compatible (AWS S3, Cloudflare R2, MinIO...)</option>
            </Select>
          </Field>

          {cfg.storage.backend === "local" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Storage directory" hint="Folder where files are saved on the server">
                <Input
                  value={cfg.storage.local_dir}
                  onChange={(e) => setCfg({ ...cfg, storage: { ...cfg.storage, local_dir: e.target.value } })}
                />
              </Field>
              <Field label="Public base URL" hint="Optional. Empty = relative /media/... path">
                <Input
                  placeholder="https://api.example.com"
                  value={cfg.storage.local_public_url}
                  onChange={(e) => setCfg({ ...cfg, storage: { ...cfg.storage, local_public_url: e.target.value } })}
                />
              </Field>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Endpoint URL" hint="e.g. https://<account>.r2.cloudflarestorage.com">
                <Input
                  value={cfg.storage.s3_endpoint_url}
                  onChange={(e) => setCfg({ ...cfg, storage: { ...cfg.storage, s3_endpoint_url: e.target.value } })}
                />
              </Field>
              <Field label="Bucket">
                <Input
                  value={cfg.storage.s3_bucket}
                  onChange={(e) => setCfg({ ...cfg, storage: { ...cfg.storage, s3_bucket: e.target.value } })}
                />
              </Field>
              <Field label="Access key">
                <Input
                  value={cfg.storage.s3_access_key}
                  onChange={(e) => setCfg({ ...cfg, storage: { ...cfg.storage, s3_access_key: e.target.value } })}
                />
              </Field>
              <Field label="Secret key">
                <Input
                  type="password"
                  placeholder={cfg.storage.s3_secret_key_set ? "(unchanged)" : ""}
                  value={s3Secret}
                  onChange={(e) => setS3Secret(e.target.value)}
                />
              </Field>
              <Field label="Region" hint="Use 'auto' for Cloudflare R2 / MinIO">
                <Input
                  value={cfg.storage.s3_region}
                  onChange={(e) => setCfg({ ...cfg, storage: { ...cfg.storage, s3_region: e.target.value } })}
                />
              </Field>
              <Field label="Public CDN URL" hint="Optional — e.g. https://cdn.example.com">
                <Input
                  value={cfg.storage.s3_public_url}
                  onChange={(e) => setCfg({ ...cfg, storage: { ...cfg.storage, s3_public_url: e.target.value } })}
                />
              </Field>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <Button loading={busy} onClick={() => save("storage")}>
              <Save className="h-4 w-4" /> Save storage
            </Button>
            <Button variant="soft" loading={busy} onClick={testStorage}>
              Test upload
            </Button>
          </div>
        </Card>
      )}

      {tab === "zoom" && (
        <Card className="p-6">
          <p className="mb-4 text-sm text-muted">
            Zoom App Marketplace → Develop → Build App → Server-to-Server OAuth. The app must be{" "}
            <strong>active</strong> — a disabled app cannot get a token. Required scopes:{" "}
            <code>meeting:write:admin</code>, <code>meeting:read:admin</code>, <code>user:read:admin</code> (a{" "}
            <code>403</code> from Zoom means the app is disabled or a scope is missing).
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account ID">
              <Input
                value={cfg.zoom.account_id}
                onChange={(e) => setCfg({ ...cfg, zoom: { ...cfg.zoom, account_id: e.target.value } })}
              />
            </Field>
            <Field label="Client ID">
              <Input
                value={cfg.zoom.client_id}
                onChange={(e) => setCfg({ ...cfg, zoom: { ...cfg.zoom, client_id: e.target.value } })}
              />
            </Field>
            <Field label="Client secret">
              <Input
                type="password"
                placeholder={cfg.zoom.client_secret_set ? "(unchanged)" : ""}
                value={zoomSecret}
                onChange={(e) => setZoomSecret(e.target.value)}
              />
            </Field>
            <Field label="Host email" hint="Optional — first account user used if empty">
              <Input
                value={cfg.zoom.host_email}
                onChange={(e) => setCfg({ ...cfg, zoom: { ...cfg.zoom, host_email: e.target.value } })}
              />
            </Field>
          </div>
          <Button className="mt-5" loading={busy} onClick={() => save("zoom")}>
            <Save className="h-4 w-4" /> Save Zoom config
          </Button>
        </Card>
      )}

      {tab === "google" && (
        <Card className="p-6">
          <p className="mb-4 text-sm text-muted">
            Google Cloud Console → APIs &amp; Services → Credentials → OAuth 2.0 Client ID.
            Add your domain redirect URI (e.g. http://localhost:8080).
          </p>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.google.enabled}
              onChange={(e) => setCfg({ ...cfg, google: { ...cfg.google, enabled: e.target.checked } })}
            />
            Enable "Sign in with Google"
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client ID">
              <Input
                value={cfg.google.client_id}
                onChange={(e) => setCfg({ ...cfg, google: { ...cfg.google, client_id: e.target.value } })}
              />
            </Field>
            <Field label="Client secret">
              <Input
                type="password"
                placeholder={cfg.google.client_secret_set ? "(unchanged)" : ""}
                value={googleSecret}
                onChange={(e) => setGoogleSecret(e.target.value)}
              />
            </Field>
          </div>
          <Button className="mt-5" loading={busy} onClick={() => save("google")}>
            <Save className="h-4 w-4" /> Save Google config
          </Button>
        </Card>
      )}

      {tab === "mail" && (
        <Card className="p-6">
          <p className="mb-4 text-sm text-muted">
            SMTP server used for student verification codes (2FA) and other emails.
          </p>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.mail.enabled}
              onChange={(e) => setCfg({ ...cfg, mail: { ...cfg.mail, enabled: e.target.checked } })}
            />
            Enable SMTP sending
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SMTP host" hint="e.g. smtp.gmail.com, smtp.hostinger.com">
              <Input
                value={cfg.mail.host}
                onChange={(e) => setCfg({ ...cfg, mail: { ...cfg.mail, host: e.target.value } })}
              />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                value={cfg.mail.port}
                onChange={(e) => setCfg({ ...cfg, mail: { ...cfg.mail, port: Number(e.target.value) } })}
              />
            </Field>
            <Field label="Username">
              <Input
                value={cfg.mail.username}
                onChange={(e) => setCfg({ ...cfg, mail: { ...cfg.mail, username: e.target.value } })}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                placeholder={cfg.mail.password_set ? "(unchanged)" : ""}
                value={mailPassword}
                onChange={(e) => setMailPassword(e.target.value)}
              />
            </Field>
            <Field label="From address" hint="noreply@yourdomain.com">
              <Input
                value={cfg.mail.from_email}
                onChange={(e) => setCfg({ ...cfg, mail: { ...cfg.mail, from_email: e.target.value } })}
              />
            </Field>
            <Field label="TLS">
              <Select
                value={cfg.mail.tls ? "1" : "0"}
                onChange={(e) => setCfg({ ...cfg, mail: { ...cfg.mail, tls: e.target.value === "1" } })}
              >
                <option value="1">STARTTLS (port 587)</option>
                <option value="0">No encryption (port 25 / local relay)</option>
              </Select>
            </Field>
            <Field label="OTP code length">
              <Input
                type="number"
                min={4}
                max={12}
                value={cfg.mail.otp_length}
                onChange={(e) => setCfg({ ...cfg, mail: { ...cfg.mail, otp_length: Number(e.target.value) } })}
              />
            </Field>
            <Field label="OTP expiry (seconds)">
              <Input
                type="number"
                min={60}
                value={cfg.mail.otp_ttl_seconds}
                onChange={(e) => setCfg({ ...cfg, mail: { ...cfg.mail, otp_ttl_seconds: Number(e.target.value) } })}
              />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-2">
            <Button loading={busy} onClick={() => save("mail")}>
              <Save className="h-4 w-4" /> Save mail config
            </Button>
            <div className="flex items-end gap-2">
              <Field label="Send test email to">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  className="w-56"
                />
              </Field>
              <Button variant="soft" loading={busy} disabled={!testTo} onClick={testMail}>
                Send test
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
