import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BadgeCheck, Calendar, Download, Printer, ShieldAlert, ShieldCheck, User, Award } from "lucide-react";
import { api, publicFileUrl } from "../../lib/api";
import type { Certificate } from "../../lib/types";
import { Alert, Badge, Button, Card, Input, LoadingBlock } from "../../components/ui";
import { HeroDecor } from "../../components/HeroDecor";

interface VerifyResp {
  valid: boolean;
  certificate: Certificate | null;
  message: string;
}

export default function Verify() {
  const { certNo } = useParams();
  const [code, setCode] = useState(certNo || "");
  const [result, setResult] = useState<VerifyResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async (no: string) => {
    if (!no.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await api.get<VerifyResp>(`/verify/${encodeURIComponent(no.trim().toUpperCase())}`);
      setResult(r);
    } catch (e) {
      setError("Verification service unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (certNo) {
      setCode(certNo);
      check(certNo);
    }
  }, [certNo, check]);

  const c = result?.certificate;

  return (
    <div className="relative overflow-hidden py-16">
      <HeroDecor variant="soft" />
      <div className="container-x relative">
      <div className="mx-auto max-w-2xl text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary2 text-white">
          <BadgeCheck className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">Certificate Verification</h1>
        <p className="mt-3 text-muted">
          Scan a certificate QR code or enter its certificate number to verify authenticity.
        </p>
      </div>

      <Card className="mx-auto mt-8 max-w-xl p-6">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            check(code);
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. LMS-2026-000001"
            className="flex-1 uppercase"
          />
          <Button type="submit" loading={loading}>
            Verify
          </Button>
        </form>
        {error && <div className="mt-4"><Alert type="error">{error}</Alert></div>}
      </Card>

      {loading && <LoadingBlock label="Verifying..." />}

      {!loading && result && (
        <Card className="mx-auto mt-6 max-w-xl overflow-hidden">
          <div
            className={`flex items-center gap-3 px-6 py-4 ${
              result.valid ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            }`}
          >
            {result.valid ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
            <div>
              <p className="font-bold">{result.valid ? "Certificate is Valid" : "Certificate Not Valid"}</p>
              <p className="text-sm opacity-80">{result.message}</p>
            </div>
          </div>
          {c && (
            <div className="space-y-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Certificate No</p>
                  <p className="text-lg font-extrabold">{c.cert_no}</p>
                </div>
                <Badge status={c.status} />
              </div>
              <div className="grid gap-3 text-sm">
                <div className="flex items-center gap-3 rounded-xl bg-surface2 p-3">
                  <User className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs text-muted">Student</p>
                    <p className="font-semibold">{c.student_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-surface2 p-3">
                  <Award className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs text-muted">Programme</p>
                    <p className="font-semibold">{c.programme_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-surface2 p-3">
                  <Calendar className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs text-muted">Completion Date</p>
                    <p className="font-semibold">
                      {c.completion_date ? new Date(c.completion_date).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </div>
                {c.final_grade != null && (
                  <div className="flex items-center gap-3 rounded-xl bg-surface2 p-3">
                    <Award className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted">Final Grade</p>
                      <p className="font-semibold">{c.final_grade}%</p>
                    </div>
                  </div>
                )}
              </div>
              {(c.pdf_url || c.print_pdf_url) && (
                <div className="flex flex-wrap gap-2">
                  {c.pdf_url && (
                    <a href={publicFileUrl(c.pdf_url) || "#"} target="_blank" rel="noreferrer" className="btn-ghost">
                      <Download className="h-4 w-4" /> Download PDF
                    </a>
                  )}
                  {c.print_pdf_url && (
                    <a href={publicFileUrl(c.print_pdf_url) || "#"} target="_blank" rel="noreferrer" className="btn-ghost">
                      <Printer className="h-4 w-4" /> Print version
                    </a>
                  )}
                </div>
              )}
              {c.qr_url && (
                <div className="flex items-center gap-4 rounded-xl border border-border p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={publicFileUrl(c.qr_url) || ""} alt="QR" className="h-24 w-24 rounded-lg bg-white p-1" />
                  <div className="text-sm text-muted">
                    <p className="font-semibold text-ink">QR Code</p>
                    <p>This QR encodes the verification URL for this certificate. Scanning it opens this page.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
      </div>
    </div>
  );
}
