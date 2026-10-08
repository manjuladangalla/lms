import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, CreditCard, Percent, ShieldCheck } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import type { Membership, MembershipPlan } from "../../lib/types";
import { useAuth } from "../../store/auth";
import { Alert, Badge, Button, Card, LoadingBlock } from "../../components/ui";
import { HeroDecor } from "../../components/HeroDecor";

export default function Memberships() {
  const { user, settings } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [cycleByPlan, setCycleByPlan] = useState<Record<string, "monthly" | "yearly">>({});

  useEffect(() => {
    api
      .get<MembershipPlan[]>("/membership-plans")
      .then(setPlans)
      .finally(() => setLoading(false));
  }, []);

  const cycleOf = (plan: MembershipPlan): "monthly" | "yearly" =>
    cycleByPlan[plan.id] || (plan.yearly_price ? "monthly" : "monthly");

  const priceOf = (plan: MembershipPlan): number =>
    cycleOf(plan) === "yearly" && plan.yearly_price != null ? plan.yearly_price : plan.price;

  const subscribe = async (plan: MembershipPlan, method: "paypal" | "manual") => {
    if (!user) return navigate("/login");
    setBusyId(plan.id);
    setError("");
    setSuccess("");
    try {
      const m = await api.post<Membership>("/memberships", {
        plan_id: plan.id,
        method,
        cycle: cycleOf(plan),
      });
      if (method === "paypal") {
        const order = await api.post<{ approve_url?: string }>("/payments/paypal/create-order", {
          purpose: "membership",
          target_id: m.id,
          return_url: window.location.origin + "/dashboard/membership",
          cancel_url: window.location.origin + "/memberships",
        });
        if (order.approve_url) {
          window.location.href = order.approve_url;
          return;
        }
      }
      setSuccess("Membership created. Complete payment verification from your dashboard.");
      setTimeout(() => navigate("/dashboard/membership"), 1200);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Subscription failed");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="relative overflow-hidden py-14">
      <HeroDecor variant="band" />
      <div className="container-x relative">
      <div className="mx-auto max-w-2xl text-center">
        <p className="badge bg-primary/10 text-primary">Memberships</p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Discount plans for every student</h1>
        <p className="mt-3 text-muted">
          Pick a plan and save <strong>25%–100% off every course fee</strong> — stack your membership discount with promo
          codes at checkout. Pay monthly or yearly.
        </p>
      </div>

      {error && <div className="mx-auto mt-6 max-w-xl"><Alert type="error">{error}</Alert></div>}
      {success && <div className="mx-auto mt-6 max-w-xl"><Alert type="success">{success}</Alert></div>}

      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const cycle = cycleOf(plan);
            const featured = plan.discount_percent === 50;
            return (
              <Card key={plan.id} className={`relative flex flex-col p-7 ${featured ? "ring-2 ring-primary" : ""}`}>
                {featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 badge bg-primary text-white">Popular</span>
                )}
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 text-lg font-extrabold text-white">
                    {plan.discount_percent}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">{plan.name}</h3>
                    <p className="text-xs text-muted">off all course fees</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted">{plan.description}</p>

                {plan.yearly_price != null && (
                  <div className="mt-4 flex rounded-lg border border-border bg-surface2 p-1 text-xs font-medium">
                    {(["monthly", "yearly"] as const).map((c) => (
                      <button
                        key={c}
                        className={`flex-1 rounded-md px-2 py-1.5 capitalize ${cycle === c ? "bg-primary text-white" : "text-muted"}`}
                        onClick={() => setCycleByPlan((s) => ({ ...s, [plan.id]: c }))}
                      >
                        {c}
                        {c === "yearly" && plan.yearly_price != null && plan.price > 0
                          ? ` · save ${Math.max(0, Math.round((1 - plan.yearly_price / (plan.price * 12)) * 100))}%`
                          : ""}
                      </button>
                    ))}
                  </div>
                )}

                <p className="mt-5 text-4xl font-extrabold text-primary">
                  {plan.currency || settings?.currency || "USD"} {priceOf(plan)}
                </p>
                <p className="text-sm text-muted">per {cycle === "yearly" ? "year" : "month"}</p>

                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {(plan.benefits || [`${plan.discount_percent}% off all course fees`]).map((b) => (
                    <li key={b} className="flex gap-2 text-muted">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {b}
                    </li>
                  ))}
                  <li className="flex gap-2 text-muted">
                    <Percent className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> Stacks with promo codes
                  </li>
                </ul>

                <div className="mt-7 space-y-2">
                  <Button className="w-full" loading={busyId === plan.id} onClick={() => subscribe(plan, "paypal")}>
                    <CreditCard className="h-4 w-4" /> Pay with PayPal
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    loading={busyId === plan.id}
                    onClick={() => subscribe(plan, "manual")}
                  >
                    Manual Transfer
                  </Button>
                </div>
              </Card>
            );
          })}
          {plans.length === 0 && (
            <Card className="col-span-full p-10 text-center text-muted">No membership plans available yet.</Card>
          )}
        </div>
      )}

      <div className="mx-auto mt-10 flex max-w-2xl items-start gap-3 rounded-2xl border border-border bg-surface2 p-4 text-sm text-muted">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        <p>
          Your discount applies automatically at checkout on every course, module and lesson. Payment gateway charges, if
          applicable, are set by the provider. Manual payments are verified by the institute before the discount activates.{" "}
          <Badge status="pending">Manual verification</Badge>
        </p>
      </div>
      </div>
    </div>
  );
}
