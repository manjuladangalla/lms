import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import type { Payment } from "../../lib/types";
import { useAuth } from "../../store/auth";
import { Alert, Badge, Button, Card, EmptyState, LoadingBlock, Table } from "../../components/ui";
import { StudentHeader } from "./Exams";

export default function Payments() {
  const { settings } = useAuth();
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [targetId, setTargetId] = useState("");

  const load = () =>
    api
      .get<Payment[]>("/payments/mine")
      .then(setItems)
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const pickProof = (id: string) => {
    setTargetId(id);
    fileRef.current?.click();
  };

  const uploadProof = async (file: File) => {
    if (!targetId) return;
    setBusyId(targetId);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.upload(`/payments/${targetId}/proof`, fd);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setBusyId("");
      setTargetId("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const paypalCapture = async (p: Payment) => {
    setBusyId(p.id);
    setError("");
    try {
      await api.post("/payments/paypal/capture", {
        order_id: p.provider_ref,
        purpose: p.purpose,
        target_id: p.target_id,
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Capture failed");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <StudentHeader title="Payments" />
      <div className="container-x py-8">
        {settings?.manual_payment_instructions && (
          <Card className="mb-6 p-5">
            <h2 className="font-bold">Manual payment instructions</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted">{settings.manual_payment_instructions}</p>
          </Card>
        )}
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
        <p className="mb-4 text-sm text-muted">
          After transferring, upload your payment proof below. The institute will verify and activate your access.
        </p>

        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf"
          onChange={(e) => e.target.files?.[0] && uploadProof(e.target.files[0])}
        />

        {loading ? (
          <LoadingBlock />
        ) : items.length === 0 ? (
          <EmptyState title="No payments yet" subtitle="Your payment history will appear here." />
        ) : (
          <Table headers={["Amount", "Purpose", "Provider", "Status", "Date", "Action"]}>
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3 font-semibold">
                  {p.currency} {p.amount}
                </td>
                <td className="px-4 py-3 capitalize">{p.purpose}</td>
                <td className="px-4 py-3 capitalize">{p.provider}</td>
                <td className="px-4 py-3">
                  <Badge status={p.status} />
                </td>
                <td className="px-4 py-3 text-muted">
                  {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  {p.status === "awaiting_verification" || (p.provider === "manual" && !p.proof_url) ? (
                    <Button variant="soft" loading={busyId === p.id} onClick={() => pickProof(p.id)}>
                      <Upload className="h-4 w-4" /> Upload proof
                    </Button>
                  ) : p.provider === "paypal" && p.status === "pending" ? (
                    <Button variant="soft" loading={busyId === p.id} onClick={() => paypalCapture(p)}>
                      Complete PayPal
                    </Button>
                  ) : p.proof_url ? (
                    <a href={p.proof_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                      View proof
                    </a>
                  ) : (
                    <span className="text-sm text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}
