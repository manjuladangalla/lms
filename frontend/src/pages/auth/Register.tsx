import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useAuth } from "../../store/auth";
import { Alert, Button, Card, Field, Input } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { GoogleButton } from "../../components/GoogleButton";
import { HeroDecor } from "../../components/HeroDecor";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await register(form.name, form.email, form.password, form.phone.trim());
      if (res?.requires_verification) {
        navigate("/verify-otp", { state: { email: res.email, dev_otp: res.dev_otp }, replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative overflow-hidden py-16">
      <HeroDecor variant="soft" />
      <div className="container-x relative flex justify-center">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary2 text-white">
            <UserPlus className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold">Create account</h1>
          <p className="mt-1 text-sm text-muted">Start learning in minutes</p>
        </div>
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
        <form onSubmit={submit} className="space-y-4">
          <Field label="Full name">
            <Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
          </Field>
          <Field label="Email">
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
          </Field>
          <Field label="Phone number" hint="Required - we use it for enrolment and exam updates.">
            <Input
              type="tel"
              required
              minLength={5}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+94 7x xxx xxxx"
            />
          </Field>
          <Field label="Password" hint="At least 6 characters">
            <Input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Register
          </Button>
        </form>
        <GoogleButton onSuccess={() => navigate("/dashboard")} />
        <p className="mt-6 text-center text-sm text-muted">
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-primary">
            Login
          </Link>
        </p>
      </Card>
      </div>
    </div>
  );
}
