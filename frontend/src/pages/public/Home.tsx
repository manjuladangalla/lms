import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Award, BookOpen, BadgeCheck, CalendarClock, ChevronLeft, ChevronRight, HeartHandshake, Lock, Percent, Users, Sparkles, ShieldCheck, Video } from "lucide-react";
import { api, publicFileUrl } from "../../lib/api";
import { bannerTheme } from "../../lib/banners";
import { useRealtime } from "../../lib/realtime";
import { HeroDecor } from "../../components/HeroDecor";
import type { Banner, CounsellingSlot, MembershipPlan, Programme } from "../../lib/types";
import { useAuth } from "../../store/auth";
import { Card, LoadingBlock } from "../../components/ui";

function ProgramCard({ p }: { p: Programme }) {
  return (
    <Link to={`/programmes/${p.slug}`} className="card group overflow-hidden transition hover:-translate-y-1 hover:shadow-soft">
      <div className="relative h-40 bg-gradient-to-br from-primary/80 via-primary2/70 to-accent/70">
        {p.cover_image_url && (
          <img src={publicFileUrl(p.cover_image_url)!} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="badge bg-black/40 text-white backdrop-blur">
            {p.type === "class" ? "Class" : p.type === "course" ? "Course" : "Diploma"}
          </span>
          {p.is_free || p.price === 0 ? <span className="badge bg-success text-white">Free</span> : null}
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-2 text-xs text-muted">
          {p.category && <span>{p.category}</span>}
          {p.level && <span>· {p.level}</span>}
          {p.duration && <span>· {p.duration}</span>}
        </div>
        <h3 className="mt-2 line-clamp-2 text-base font-bold group-hover:text-primary">{p.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{p.summary}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-lg font-extrabold text-primary">
            {p.is_free || p.price === 0 ? "Free" : `${p.currency || "USD"} ${p.price}`}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            View <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [idx, setIdx] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => {
      if (paused.current) return;
      setIdx((i) => (i + 1) % banners.length);
    }, 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  if (banners.length === 0) return null;
  const b = banners[Math.min(idx, banners.length - 1)];
  const theme = bannerTheme(b.theme);
  const go = (d: number) => setIdx((i) => (i + d + banners.length) % banners.length);

  return (
    <section
      className="container-x -mt-6"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-r ${theme.className} p-8 text-white shadow-soft sm:p-12`}
      >
        {b.image_url && (
          <img
            src={publicFileUrl(b.image_url)!}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
        )}
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/20 blur-3xl" />
        <div className="relative flex min-h-[160px] max-w-2xl flex-col justify-center">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> Featured
          </span>
          <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">{b.title}</h2>
          {b.subtitle && <p className="mt-2 max-w-xl text-white/90">{b.subtitle}</p>}
          {b.cta_text && (
            <Link
              to={b.link_url || "/courses"}
              className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:-translate-y-0.5"
            >
              {b.cta_text} <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {banners.length > 1 && (
          <>
            <button
              aria-label="Previous banner"
              className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/20 p-2 transition hover:bg-black/40 sm:block"
              onClick={() => go(-1)}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              aria-label="Next banner"
              className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/20 p-2 transition hover:bg-black/40 sm:block"
              onClick={() => go(1)}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              {banners.map((x, i) => (
                <button
                  key={x.id}
                  aria-label={`Banner ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-2 bg-white/50"}`}
                  onClick={() => setIdx(i)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const { settings } = useAuth();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [counselling, setCounselling] = useState<CounsellingSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, m, b] = await Promise.all([
          api.get<{ items: Programme[] }>("/programmes?size=6"),
          api.get<MembershipPlan[]>("/membership-plans"),
          api.get<Banner[]>("/banners").catch(() => []),
        ]);
        setProgrammes(p.items || []);
        setPlans(m || []);
        setBanners(b || []);
      } finally {
        setLoading(false);
      }
    })();
    api
      .get<CounsellingSlot[]>("/counselling/upcoming-slots?limit=3")
      .then(setCounselling)
      .catch(() => setCounselling([]));
  }, []);

  useRealtime((event) => {
    if (event === "banners.changed") api.get<Banner[]>("/banners").then(setBanners).catch(() => {});
  });

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-bg via-surface to-surface2">
        <HeroDecor variant="hero" />
        <div className="container-x relative py-20 lg:py-28">
          <div className="max-w-3xl animate-fadeUp">
            <span className="badge bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5" /> {settings?.tagline || "Learn. Grow. Get Certified."}
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {settings?.home_hero_title || "Build Skills That Matter"}
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted">
              {settings?.home_hero_subtitle ||
                "Explore classes, courses and diploma programmes with expert lecturers and earn verified digital certificates."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/courses" className="btn-primary px-6 py-3 text-base">
                Browse Courses <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/memberships" className="btn-ghost px-6 py-3 text-base">
                View Memberships
              </Link>
            </div>
          </div>
        </div>
      </section>

      <BannerCarousel banners={banners} />

      <section className="container-x py-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <BookOpen className="h-5 w-5" />, label: "Programmes", value: programmes.length ? `${programmes.length}+` : "10+" },
            { icon: <Users className="h-5 w-5" />, label: "Active Learners", value: "500+" },
            { icon: <Award className="h-5 w-5" />, label: "Certificates Issued", value: "200+" },
            { icon: <BadgeCheck className="h-5 w-5" />, label: "QR Verified", value: "100%" },
          ].map((s) => (
            <Card key={s.label} className="flex items-center gap-4 p-5">
              <span className="rounded-xl bg-primary/10 p-3 text-primary">{s.icon}</span>
              <div>
                <p className="text-xl font-extrabold">{s.value}</p>
                <p className="text-sm text-muted">{s.label}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="container-x pb-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Featured Programmes</h2>
            <p className="mt-1 text-muted">Classes, courses and diplomas to level up your career.</p>
          </div>
          <div className="hidden gap-2 sm:flex">
            <Link to="/classes" className="btn-ghost">Classes</Link>
            <Link to="/courses" className="btn-ghost">Courses</Link>
            <Link to="/diploma" className="btn-ghost">Diploma</Link>
          </div>
        </div>
        {loading ? (
          <LoadingBlock />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {programmes.map((p) => (
              <ProgramCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      {plans.length > 0 && (
        <section className="border-y border-border bg-surface2/50 py-16">
          <div className="container-x">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-extrabold sm:text-3xl">Membership Plans</h2>
              <p className="mt-1 text-muted">Save 25%–100% on every course fee — monthly or yearly.</p>
            </div>
            <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {plans.slice(0, 4).map((plan) => (
                <Card key={plan.id} className="flex flex-col p-6 text-center">
                  <p className="font-bold">{plan.name}</p>
                  <p className="mt-3 inline-flex items-center justify-center gap-1 text-4xl font-extrabold text-primary">
                    <Percent className="h-7 w-7" />
                    {plan.discount_percent ?? 25}
                    <span className="text-base font-bold">off</span>
                  </p>
                  <p className="text-sm text-muted">
                    {plan.currency || settings?.currency || "USD"} {plan.price}/month
                    {plan.yearly_price != null && ` · ${plan.currency || "USD"} ${plan.yearly_price}/year`}
                  </p>
                  <ul className="mt-5 flex-1 space-y-2 text-left text-sm text-muted">
                    {(plan.benefits || [`Save ${plan.discount_percent ?? 25}% on all courses`]).map((b) => (
                      <li key={b} className="flex gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {b}
                      </li>
                    ))}
                  </ul>
                  <Link to="/memberships" className="btn-primary mt-6">
                    Choose Plan
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="container-x pb-16">
        <div className="grid gap-8 rounded-3xl border border-border bg-surface2/60 p-8 sm:p-10 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="badge bg-primary/10 text-primary">
              <HeartHandshake className="h-3.5 w-3.5" /> Counselling
            </span>
            <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">
              Confidential support, when you need it
            </h2>
            <p className="mt-3 text-muted">
              Our qualified counsellors keep regular weekly slots, just like a clinic diary. Choose a counsellor, pick a
              day and a free time, and book online (Zoom) or in person at the centre - no account needed. What you
              discuss stays between you and your counsellor.
            </p>
            <ul className="mt-5 space-y-3 text-sm">
              <li className="flex items-start gap-2.5">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <strong>Slots for every day of the week</strong> - mornings, afternoons and Saturdays. Once a time is
                  taken it disappears from the list.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Video className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <strong>Online or in person</strong> - Zoom meetings are created instantly for online bookings, with
                  the join link shown on your confirmation.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <strong>Private by default</strong> - exam stress, anxiety, careers, relationships and big life
                  changes, for students, parents and adults.
                </span>
              </li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/counselling" className="btn-primary">
                Book a session <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/counselling" className="btn-ghost">
                Meet the counsellors
              </Link>
            </div>
          </div>

          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold">Next free slots</h3>
              <span className="badge bg-primary/10 text-primary">
                <CalendarClock className="h-3.5 w-3.5" /> This week
              </span>
            </div>
            {counselling.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                No free times right now - new slots are released weekly. Check the counselling page to see when the
                next ones open.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {counselling.map((slot) => (
                  <li key={`${slot.schedule_id}-${slot.start}`}>
                    <Link
                      to="/counselling"
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 transition hover:border-primary"
                    >
                      <span>
                        <span className="block text-sm font-bold">
                          {new Date(slot.start).toLocaleString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="block text-xs text-muted">
                          {slot.counsellor_name} · {slot.mode === "in_person" ? "In person" : "Online"} ·{" "}
                          {slot.duration_min} min
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-primary">Book</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted">
              Guest booking - your details are never shared with teachers or family.
            </p>
          </Card>
        </div>
      </section>

      <section className="container-x pb-16">
        <Card className="relative overflow-hidden p-8 sm:p-12">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10" />
          <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-extrabold">Earn a verified digital certificate</h2>
              <p className="mt-2 max-w-xl text-muted">
                Complete your programme and get a certificate with a unique QR code — verifiable by anyone, anywhere.
              </p>
            </div>
            <Link to="/verify" className="btn-primary whitespace-nowrap">
              Verify a Certificate
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
