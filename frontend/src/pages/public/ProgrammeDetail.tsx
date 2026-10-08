import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Clock, PlayCircle, Users, ShieldCheck, FileDown } from "lucide-react";
import { api, publicFileUrl } from "../../lib/api";
import type { Enrolment, Programme } from "../../lib/types";
import { useAuth } from "../../store/auth";
import { Alert, Badge, Button, Card, LoadingBlock, Modal, Spinner } from "../../components/ui";
import { PromoQuote } from "../../components/PromoQuote";
import { HeroDecor } from "../../components/HeroDecor";
import { ApiError } from "../../lib/api";

export default function ProgrammeDetail() {
  const { slug } = useParams();
  const { user, settings } = useAuth();
  const navigate = useNavigate();
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [scopeBuy, setScopeBuy] = useState<{ type: "subject" | "lesson"; id: string; title: string; price: number } | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [scopePromo, setScopePromo] = useState<string | null>(null);

  const load = async () => {
    if (!slug) return;
    try {
      const p = await api.get<Programme>(`/programmes/${slug}`);
      setProgramme(p);
      if (user) {
        const ens = await api.get<Enrolment[]>("/enrolments/mine");
        setEnrolments(ens);
      }
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [slug, user?.id]);

  if (loading) return <LoadingBlock />;
  if (!programme) return <div className="container-x py-16"><Alert type="error">{error || "Programme not found"}</Alert></div>;

  const price = programme.price || 0;
  const isFree = programme.is_free || price === 0;
  const currency = programme.currency || settings?.currency || "USD";
  const mode = programme.pricing_mode || "once";
  const interval =
    programme.billing_interval === "weekly"
      ? "week"
      : programme.billing_interval === "semester"
      ? "4 months"
      : programme.billing_interval === "yearly"
      ? "year"
      : "month";
  const scopeKeyOf = (e: Enrolment) => e.scope_key || "programme";
  const myProgEnrols = enrolments.filter((e) => e.programme_id === programme.id && scopeKeyOf(e) === "programme");
  const enrolment = myProgEnrols.find((e) => e.status === "active") || myProgEnrols.find((e) => e.status === "pending_verification") || myProgEnrols[0] || null;
  const expired = !!(enrolment?.access_expires_at && new Date(enrolment.access_expires_at).getTime() < Date.now());
  const active = enrolment?.status === "active" && !expired;
  const owns = (key: string) => enrolments.find((e) => e.programme_id === programme.id && scopeKeyOf(e) === key && e.status === "active");
  const scopePending = (key: string) => enrolments.find((e) => e.programme_id === programme.id && scopeKeyOf(e) === key && e.status === "pending_verification");

  const allLessons = (programme.subjects || []).flatMap((s) => s.lessons || []);
  const scopePrices =
    mode === "per_module"
      ? (programme.subjects || []).map((s) => s.price ?? 0).filter((v) => v > 0)
      : allLessons.map((l) => l.price ?? 0).filter((v) => v > 0);
  const minScopePrice = scopePrices.length ? Math.min(...scopePrices) : price;

  const priceHeadline =
    isFree && mode !== "subscription" && (mode !== "per_module" || !scopePrices.length) && (mode !== "per_lesson" || !scopePrices.length)
      ? "Free"
      : mode === "per_module" || mode === "per_lesson"
      ? `From ${currency} ${minScopePrice}`
      : `${currency} ${price}${mode === "subscription" ? ` / ${interval}` : ""}`;

  const priceBlurb =
    mode === "subscription"
      ? `Time-limited access — pay per ${interval}. Access expires after each paid period; renew anytime to extend.`
      : mode === "per_module"
      ? "Buy the full programme, or unlock individual modules from the curriculum."
      : mode === "per_lesson"
      ? "Buy the full programme, or unlock individual lessons from the curriculum."
      : "One-time payment · access managed automatically after confirmation.";

  const enrolFree = async () => {
    if (!user) return navigate("/login");
    setBusy(true);
    setError("");
    try {
      await api.post("/enrolments", { programme_id: programme.id, method: "free" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Enrolment failed");
    } finally {
      setBusy(false);
    }
  };

  const enrolManual = async () => {
    if (!user) return navigate("/login");
    setBusy(true);
    setError("");
    try {
      await api.post("/enrolments", { programme_id: programme.id, method: "manual", promo_code: promoCode || undefined });
      navigate("/dashboard/payments");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Enrolment failed");
    } finally {
      setBusy(false);
    }
  };

  const enrolPayPal = async () => {
    if (!user) return navigate("/login");
    setBusy(true);
    setError("");
    try {
      const en = await api.post<Enrolment>("/enrolments", { programme_id: programme.id, method: "paypal", promo_code: promoCode || undefined });
      const order = await api.post<{ approve_url?: string; order_id: string }>("/payments/paypal/create-order", {
        purpose: "enrolment",
        target_id: en.id,
        return_url: window.location.origin,
        cancel_url: window.location.origin,
      });
      if (order.approve_url) window.location.href = order.approve_url;
      else setPayOpen(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "PayPal init failed");
      setBusy(false);
    }
  };

  const buyScope = async (
    type: "subject" | "lesson",
    id: string,
    amount: number,
    method: "manual" | "paypal",
    promo?: string | null,
  ) => {
    if (!user) return navigate("/login");
    setBusy(true);
    setError("");
    try {
      if (amount <= 0) {
        await api.post("/enrolments", { programme_id: programme.id, scope_type: type, scope_id: id, method: "free" });
        await load();
        return;
      }
      const en = await api.post<Enrolment>("/enrolments", {
        programme_id: programme.id,
        scope_type: type,
        scope_id: id,
        method,
        promo_code: promo || undefined,
      });
      if (method === "manual") {
        navigate("/dashboard/payments");
        return;
      }
      const order = await api.post<{ approve_url?: string; order_id: string }>("/payments/paypal/create-order", {
        purpose: "enrolment",
        target_id: en.id,
        return_url: window.location.origin,
        cancel_url: window.location.origin,
      });
      if (order.approve_url) window.location.href = order.approve_url;
      else setPayOpen(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Purchase failed");
      setBusy(false);
    }
  };

  return (
    <div className="relative overflow-hidden py-12">
      <HeroDecor variant="soft" />
      <div className="container-x relative">
      <div className="grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge status="published">{programme.type}</Badge>
            {programme.category && <span className="text-sm text-muted">{programme.category}</span>}
            {programme.level && <span className="text-sm text-muted">· {programme.level}</span>}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{programme.title}</h1>
          <p className="mt-3 text-lg text-muted">{programme.summary}</p>

          <div className="mt-6 flex flex-wrap gap-5 text-sm text-muted">
            {programme.duration && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> {programme.duration}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {programme.instructors?.length || 1} lecturer(s)
            </span>
            {programme.final_exam_required && (
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> Final exam required
              </span>
            )}
          </div>

          {programme.intro_video_url && (
            <Card className="mt-6 overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface2/60 px-5 py-3">
                <p className="flex items-center gap-2 font-semibold">
                  <PlayCircle className="h-4 w-4 text-primary" /> Intro video
                </p>
                <Badge status="pending">Free preview — watch without enrolling</Badge>
              </div>
              <div className="p-4">
                {(() => {
                  const url = programme.intro_video_url;
                  const isYoutube = url.includes("youtube") || url.includes("youtu.be");
                  return isYoutube ? (
                    <iframe
                      className="aspect-video w-full rounded-xl"
                      src={url.replace("watch?v=", "embed/")}
                      title="Intro video"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      className="aspect-video w-full rounded-xl bg-black"
                      controls
                      preload="metadata"
                      src={publicFileUrl(url) || url}
                    />
                  );
                })()}
              </div>
            </Card>
          )}

          <Card className="mt-8 p-6">
            <h2 className="text-lg font-bold">About this programme</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{programme.description || programme.summary}</p>
          </Card>

          {programme.learn_outcomes?.length ? (
            <Card className="mt-6 p-6">
              <h2 className="text-lg font-bold">What you'll learn</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {programme.learn_outcomes.map((o, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {o}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="mt-6 space-y-4">
            <h2 className="text-lg font-bold">Curriculum</h2>
            {(programme.subjects || []).length === 0 && <p className="text-sm text-muted">Syllabus coming soon.</p>}
            {(programme.subjects || []).map((s) => {
              const sKey = `subject:${s.id}`;
              const sOwned = !!owns(sKey) || active;
              const sPending = scopePending(sKey);
              return (
                <Card key={s.id} className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface2/60 px-5 py-3">
                    <span className="font-semibold">
                      {s.title} {s.is_free_preview && <Badge status="pending">Free preview</Badge>}
                      {mode === "per_module" && (s.price ?? 0) > 0 && !sOwned && (
                        <span className="ml-2 text-sm font-normal text-muted">
                          {currency} {s.price}
                        </span>
                      )}
                    </span>
                    {mode === "per_module" && !sOwned && user &&
                      (sPending ? (
                        <Link to="/dashboard/payments" className="btn-ghost px-3 py-1.5 text-xs">
                          Payment pending
                        </Link>
                      ) : (
                        <button
                          className="btn-primary px-3 py-1.5 text-xs"
                          disabled={busy}
                          onClick={() => setScopeBuy({ type: "subject", id: s.id, title: s.title, price: s.price ?? 0 })}
                        >
                          {(s.price ?? 0) > 0 ? `Unlock ${currency} ${s.price}` : "Unlock free"}
                        </button>
                      ))}
                    {sOwned && <Badge status="active">Owned</Badge>}
                  </div>
                  <ul className="divide-y divide-border">
                    {(s.lessons || []).map((l) => {
                      const lKey = `lesson:${l.id}`;
                      const lOwned = !!owns(lKey) || sOwned || l.is_free_preview;
                      const lPending = scopePending(lKey);
                      return (
                        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                          <span className="inline-flex items-center gap-2">
                            <PlayCircle className="h-4 w-4 text-primary" /> {l.title}
                            {l.is_free_preview && <Badge status="pending">Preview</Badge>}
                            {mode === "per_lesson" && (l.price ?? 0) > 0 && !lOwned && (
                              <span className="text-xs text-muted">
                                {currency} {l.price}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-3">
                            {mode === "per_lesson" && !lOwned && user &&
                              (lPending ? (
                                <Link to="/dashboard/payments" className="text-xs text-warning hover:underline">
                                  Payment pending
                                </Link>
                              ) : (
                                <button
                                  className="btn-primary px-3 py-1.5 text-xs"
                                  disabled={busy}
                                  onClick={() => setScopeBuy({ type: "lesson", id: l.id, title: l.title, price: l.price ?? 0 })}
                                >
                                  {(l.price ?? 0) > 0 ? `Unlock ${currency} ${l.price}` : "Unlock free"}
                                </button>
                              ))}
                            <span className="text-xs text-muted">{l.duration_min} min</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-24 p-6">
            <p className="text-3xl font-extrabold text-primary">{priceHeadline}</p>
            <p className="mt-1 text-sm text-muted">{priceBlurb}</p>
            {!active && user && !isFree && (
              <>
                <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Members save up to 100% on this course — apply a promo code too at checkout.
                </p>
                <PromoQuote programmeId={programme.id} onQuote={(q) => setPromoCode(q?.promo_code ?? null)} />
              </>
            )}
            {expired && (
              <p className="mt-2 text-xs font-semibold text-danger">
                Your access expired {enrolment?.access_expires_at ? new Date(enrolment.access_expires_at).toLocaleDateString() : ""} — re-subscribe below to renew.
              </p>
            )}

            {error && <div className="mt-4"><Alert type="error">{error}</Alert></div>}

            <div className="mt-5 flex flex-col gap-2">
              {active ? (
                <Link to={`/learn/${programme.id}`} className="btn-primary">
                  Continue Learning
                </Link>
              ) : enrolment?.status === "pending_verification" ? (
                <Link to="/dashboard/payments" className="btn-ghost">
                  Payment pending — view status
                </Link>
              ) : isFree && (mode === "once" || mode === "subscription") ? (
                <Button loading={busy} onClick={enrolFree}>
                  Enroll Free
                </Button>
              ) : (mode === "per_module" || mode === "per_lesson") && price <= 0 && !programme.is_free ? (
                <p className="text-sm text-muted">
                  Choose individual {mode === "per_module" ? "modules" : "lessons"} from the curriculum below to get started.
                </p>
              ) : (
                <>
                  <Button loading={busy} onClick={enrolManual}>
                    {mode === "subscription" ? `Subscribe ${interval === "week" ? "weekly" : "monthly"} — Manual Transfer` : "Pay with Manual Transfer"}
                  </Button>
                  <Button variant="ghost" loading={busy} onClick={enrolPayPal}>
                    Pay with PayPal
                  </Button>
                  {mode === "per_module" || mode === "per_lesson" ? (
                    <p className="text-center text-xs text-muted">
                      or unlock individual {mode === "per_module" ? "modules" : "lessons"} from the curriculum below
                    </p>
                  ) : null}
                </>
              )}
              {!user && (
                <Button variant="ghost" onClick={() => navigate("/login")}>
                  Login to Enroll
                </Button>
              )}
            </div>

            <ul className="mt-6 space-y-2 border-t border-border pt-5 text-sm text-muted">
              {allLessons.length > 0 && <li>✓ {allLessons.length} lessons</li>}
              {programme.materials?.length ? <li>✓ {programme.materials.length} study materials</li> : null}
              <li>✓ Progress tracking dashboard</li>
              <li>✓ Online exams & results</li>
              <li>✓ QR-verified certificate</li>
            </ul>

            <div className="mt-5 rounded-xl bg-surface2 p-3 text-xs text-muted">
              Payment gateway provider charges and transaction fees (if any) are charged separately by the payment provider.
            </div>
          </Card>
        </div>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="PayPal">
        <p className="text-sm text-muted">PayPal is not fully configured on this deployment. Please use manual transfer instead.</p>
        <Button className="mt-4 w-full" onClick={() => { setPayOpen(false); enrolManual(); }}>
          Use Manual Transfer
        </Button>
      </Modal>

      <Modal open={!!scopeBuy} onClose={() => { setScopeBuy(null); setScopePromo(null); }} title={scopeBuy ? `Unlock — ${scopeBuy.title}` : ""}>
        {scopeBuy && (
          <div>
            <p className="text-2xl font-extrabold text-primary">
              {scopeBuy.price > 0 ? `${currency} ${scopeBuy.price}` : "Free"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {scopeBuy.type === "subject" ? "Module" : "Lesson"} purchase — permanent access, no expiry.
            </p>
            {scopeBuy.price > 0 && (
              <PromoQuote
                programmeId={programme.id}
                scopeType={scopeBuy.type}
                scopeId={scopeBuy.id}
                onQuote={(q) => setScopePromo(q?.promo_code ?? null)}
              />
            )}
            <div className="mt-5 flex flex-col gap-2">
              {scopeBuy.price > 0 ? (
                <>
                  <Button
                    loading={busy}
                    onClick={() => {
                      const b = scopeBuy;
                      setScopeBuy(null);
                      setScopePromo(null);
                      buyScope(b.type, b.id, b.price, "manual", scopePromo);
                    }}
                  >
                    Pay with Manual Transfer
                  </Button>
                  <Button
                    variant="ghost"
                    loading={busy}
                    onClick={() => {
                      const b = scopeBuy;
                      setScopeBuy(null);
                      setScopePromo(null);
                      buyScope(b.type, b.id, b.price, "paypal", scopePromo);
                    }}
                  >
                    Pay with PayPal
                  </Button>
                </>
              ) : (
                <Button
                  loading={busy}
                  onClick={() => {
                    const b = scopeBuy;
                    setScopeBuy(null);
                    buyScope(b.type, b.id, 0, "manual");
                  }}
                >
                  Get it free
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
      </div>
    </div>
  );
}
