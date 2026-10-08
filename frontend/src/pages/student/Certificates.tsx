import { useEffect, useState } from "react";
import { Award, Download, Printer, QrCode } from "lucide-react";
import { api, publicFileUrl } from "../../lib/api";
import type { Certificate } from "../../lib/types";
import { Badge, Card, EmptyState, LoadingBlock, Modal } from "../../components/ui";
import { StudentHeader } from "./Exams";

export default function Certificates() {
  const [items, setItems] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<Certificate | null>(null);

  useEffect(() => {
    api
      .get<Certificate[]>("/certificates/mine")
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <StudentHeader title="Certificates" />
      <div className="container-x py-8">
        {loading ? (
          <LoadingBlock />
        ) : items.length === 0 ? (
          <EmptyState
            title="No certificates yet"
            subtitle="Complete a programme (and pass the final exam if required) to earn a QR-verified certificate."
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <Card key={c.id} className="overflow-hidden">
                <div className="bg-gradient-to-br from-primary to-primary2 p-5 text-white">
                  <div className="flex items-center justify-between">
                    <Award className="h-6 w-6" />
                    <Badge status={c.status} />
                  </div>
                  <p className="mt-4 text-xs uppercase tracking-widest opacity-80">Certificate of Completion</p>
                  <p className="mt-1 text-lg font-extrabold">{c.programme_name}</p>
                  <p className="mt-3 text-sm opacity-90">{c.student_name}</p>
                  {c.final_grade != null && (
                    <p className="mt-1 text-sm opacity-90">Final grade: {c.final_grade}%</p>
                  )}
                  <p className="mt-4 text-xs opacity-75">{c.cert_no}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <button className="btn-ghost flex-1" onClick={() => setPreview(c)}>
                    <QrCode className="h-4 w-4" /> View QR
                  </button>
                  {c.pdf_url ? (
                    <a href={publicFileUrl(c.pdf_url) || "#"} target="_blank" rel="noreferrer" className="btn-primary flex-1">
                      <Download className="h-4 w-4" /> PDF
                    </a>
                  ) : (
                    <span className="flex-1 text-center text-xs text-muted">PDF pending</span>
                  )}
                  {c.print_pdf_url && (
                    <a href={publicFileUrl(c.print_pdf_url) || "#"} target="_blank" rel="noreferrer" className="btn-ghost flex-1">
                      <Printer className="h-4 w-4" /> Print
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Certificate QR">
        {preview && (
          <div className="text-center">
            {preview.qr_url ? (
              <img src={publicFileUrl(preview.qr_url) || ""} alt="QR" className="mx-auto h-56 w-56 rounded-xl bg-white p-2" />
            ) : (
              <p className="text-sm text-muted">QR code is being generated.</p>
            )}
            <p className="mt-4 font-mono text-sm font-bold">{preview.cert_no}</p>
            <p className="mt-1 text-xs text-muted">
              Anyone can verify this certificate at /verify/{preview.cert_no}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
