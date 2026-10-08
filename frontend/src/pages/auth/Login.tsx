import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "../../store/auth";
import { Alert, Button, Card, Field, Input } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { GoogleButton } from "../../components/GoogleButton";
import { HeroDecor } from "../../components/HeroDecor";

export default function Login() {
  const { login, user, settings } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;

  useEffect(() => {
    if (user) navigate(from || (user.role === "student" ? "/dashboard" : "/admin"), { replace: true });
  }, [user, navigate, from]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const u = await login(email, password);
      navigate(from || (u.role === "student" ? "/dashboard" : "/admin"), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
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
            <GraduationCap className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Login to {settings?.site_name || "your institute"}</p>
        </div>
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Password">
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Login
          </Button>
        </form>
        <GoogleButton onSuccess={(u) => navigate(from || (u?.role === "student" || !u ? "/dashboard" : "/admin"))} />
        <p className="mt-6 text-center text-sm text-muted">
          No account?{" "}
          <Link to="/register" className="font-semibold text-primary">
            Register
          </Link>
        </p>
      </Card>
      </div>
    </div>
  );
}
