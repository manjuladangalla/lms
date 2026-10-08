import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { useAuth } from "../../store/auth";
import { Alert, Button, Card, Field, Input } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { HeroDecor } from "../../components/HeroDecor";

export default function VerifyOtp() {
  const { verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as { email?: string; dev_otp?: string };
  const [email, setEmail] = useState(state.email || "");
  const [code, setCode] = useState(state.dev_otp || "");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await verifyOtp(email, code);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError("");
    setInfo("");
    try {
      await resendOtp(email);
      setInfo("A new code has been sent to your email.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resend code");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="relative overflow-hidden py-16">
      <HeroDecor variant="soft" />
      <div className="container-x relative flex justify-center">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary2 text-white">
            <MailCheck className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold">Verify your email</h1>
          <p className="mt-1 text-sm text-muted">
            Enter the 6-digit code we sent to your email to activate your account.
          </p>
        </div>
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
        {info && <div className="mb-4"><Alert type="success">{info}</Alert></div>}
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Verification code">
            <Input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
              placeholder="123456"
              className="text-center text-2xl tracking-[0.4em]"
            />
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Verify & continue
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <button type="button" className="font-semibold text-primary hover:underline" onClick={resend} disabled={resending}>
            {resending ? "Sending..." : "Resend code"}
          </button>
          <Link to="/login" className="text-muted hover:text-ink">
            Back to login
          </Link>
        </div>
      </Card>
      </div>
    </div>
  );
}
