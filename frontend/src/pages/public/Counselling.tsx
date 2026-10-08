import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Globe,
  HeartHandshake,
  Lock,
  MapPin,
  Users,
  Video,
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useRealtime } from "../../lib/realtime";
import type {
  CounsellingBooking,
  CounsellingDateOption,
  CounsellingSlot,
  Counsellor,
  CounsellorWeek,
} from "../../lib/types";
import { useAuth } from "../../store/auth";
import { Alert, Badge, Button, Card, Field, Input, LoadingBlock } from "../../components/ui";
import { HeroDecor } from "../../components/HeroDecor";

const pad = (n: number) => String(n).padStart(2, "0");

const dateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const dateLabel = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const when = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const weeklyLabel = (weekly: CounsellorWeek[] = []) => {
  const groups = new Map<string, string[]>();
  for (const w of weekly) {
    const key = `${w.start_time} - ${w.end_time}`;
    const days = groups.get(key) || [];
    days.push(DAY_NAMES[w.weekday] || "");
    groups.set(key, days);
  }
  return [...groups.entries()].map(([range, days]) => `${days.join(", ")} · ${range.replace(" - ", "–")}`);
};

const STEPS = ["Counsellor", "Date", "Time", "Mode", "Details"];

export default function Counselling() {
  const { user, settings } = useAuth();
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]);
  const [upcoming, setUpcoming] = useState<CounsellingSlot[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState(1);
  const [counsellor, setCounsellor] = useState<Counsellor | null>(null);
  const [dates, setDates] = useState<CounsellingDateOption[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [view, setView] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [slots, setSlots] = useState<CounsellingSlot[]>([]);
  const [slot, setSlot] = useState<CounsellingSlot | null>(null);
  const [mode, setMode] = useState<"online" | "in_person" | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<CounsellingBooking | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const [c, s] = await Promise.all([
        api.get<Counsellor[]>("/counselling/counsellors"),
        api.get<CounsellingSlot[]>("/counselling/upcoming-slots").catch(() => []),
      ]);
      setCounsellors(c);
      setUpcoming(s || []);
    } catch {
      /* keep last data */
    } finally {
      setLoading(false);
    }
  };

  const loadDates = async (counsellorId: string) => {
    try {
      setDates(await api.get<CounsellingDateOption[]>(`/counselling/dates?counsellor_id=${counsellorId}`));
    } catch {
      setDates([]);
    }
  };

  const loadSlots = async (counsellorId: string, day: string) => {
    try {
      const res = await api.get<{ slots: CounsellingSlot[] }>(
        `/counselling/slots?counsellor_id=${counsellorId}&date=${day}`
      );
      setSlots(res.slots || []);
    } catch {
      setSlots([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime((event) => {
    if (!event.startsWith("counselling.")) return;
    load();
    if (counsellor) loadDates(counsellor.id);
    if (counsellor && date) loadSlots(counsellor.id, date);
  });

  const modeOptions: ("online" | "in_person")[] = slot
    ? slot.mode === "both"
      ? ["online", "in_person"]
      : [slot.mode]
    : [];

  const reset = (toStep = 1) => {
    setDone(null);
    setError("");
    setCopied(false);
    if (toStep <= 1) {
      setCounsellor(null);
      setDates([]);
      setDate(null);
      setSlots([]);
      setSlot(null);
      setMode(null);
    } else if (toStep <= 2) {
      setDate(null);
      setSlots([]);
      setSlot(null);
      setMode(null);
    } else if (toStep <= 3) {
      setSlot(null);
      setMode(null);
    } else if (toStep <= 4) {
      setMode(null);
    }
    setStep(toStep);
  };

  const pickCounsellor = (c: Counsellor) => {
    setCounsellor(c);
    setDate(null);
    setSlots([]);
    setSlot(null);
    setMode(null);
    setDone(null);
    setError("");
    loadDates(c.id);
    setStep(2);
  };

  const pickDate = (key: string) => {
    setDate(key);
    setSlot(null);
    setMode(null);
    if (counsellor) loadSlots(counsellor.id, key);
    setStep(3);
  };

  const pickSlot = (s: CounsellingSlot) => {
    setSlot(s);
    const opts = s.mode === "both" ? ["online", "in_person"] : [s.mode];
    setMode(opts.length === 1 ? (opts[0] as "online" | "in_person") : null);
    setStep(4);
  };

  const pickMode = (m: "online" | "in_person") => {
    setMode(m);
    setStep(5);
  };

  const submit = async () => {
    if (!slot || !mode) return;
    setBusy(true);
    setError("");
    try {
      const booking = await api.post<CounsellingBooking>("/counselling/book", {
        schedule_id: slot.schedule_id,
        slot_start: slot.start,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        note: form.note.trim() || null,
        mode,
      });
      setDone(booking);
      load();
      if (counsellor) loadDates(counsellor.id);
      if (counsellor && date) loadSlots(counsellor.id, date);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Booking failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const jumpToSlot = (s: CounsellingSlot) => {
    const c = counsellors.find((x) => x.id === s.counsellor_id);
    if (!c) return;
    setCounsellor(c);
    const key = dateKey(s.start);
    setDate(key);
    setSlot(s);
    const opts = s.mode === "both" ? ["online", "in_person"] : [s.mode];
    setMode(opts.length === 1 ? (opts[0] as "online" | "in_person") : null);
    loadDates(c.id);
    loadSlots(c.id, key);
    setDone(null);
    setError("");
    setStep(s.mode === "both" ? 4 : 5);
    window.scrollTo({ top: document.getElementById("book")?.offsetTop || 0, behavior: "smooth" });
  };

  const copyLink = async () => {
    if (!done?.join_url) return;
    try {
      await navigator.clipboard.writeText(done.join_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const initials = (name?: string | null) =>
    (name || "C")
      .split(" ")
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("");

  const price = (value: number, currency?: string) =>
    value > 0 ? `${currency || settings?.currency || "USD"} ${value}` : "Free";

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const dateMap = new Map(dates.map((d) => [d.date, d]));

  const shiftMonth = (delta: number) =>
    setView(new Date(view.getFullYear(), view.getMonth() + delta, 1));

  const cells: (string | null)[] = (() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // week starts on Monday
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(ymd(new Date(view.getFullYear(), view.getMonth(), d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  })();

  return (
    <>
      <div className="relative overflow-hidden py-16">
        <HeroDecor variant="hero" />
        <div className="container-x relative">
          <div className="mx-auto max-w-3xl text-center">
            <p className="badge bg-primary/10 text-primary">Counselling</p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
              Someone to talk to, in confidence
            </h1>
            <p className="mt-4 text-lg text-muted">
              Our counsellors keep weekly slots like a clinic diary - pick a counsellor, a date and a free time, then
              book online (Zoom) or in person. No account needed.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <a href="#book" className="btn-primary">
                Book a private session
              </a>
              <Link to="/contact" className="btn-ghost">
                Ask a question
              </Link>
            </div>
          </div>

          <div className="mt-11 grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Lock className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-bold">Private and confidential</h3>
              <p className="mt-1 text-sm text-muted">
                Session details are never shared with teachers or family without your consent.
              </p>
            </Card>
            <Card className="p-5">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Globe className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-bold">Online or in person</h3>
              <p className="mt-1 text-sm text-muted">
                Online bookings get a Zoom link instantly. In-person sessions are at the centre.
              </p>
            </Card>
            <Card className="p-5">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HeartHandshake className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-bold">Qualified counsellors</h3>
              <p className="mt-1 text-sm text-muted">
                Support for students, parents and adults - exams, anxiety, relationships and change.
              </p>
            </Card>
          </div>
        </div>
      </div>

      <section id="book" className="container-x scroll-mt-24 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">Book a session</h2>
            <p className="mt-2 text-muted">
              Five quick steps - <strong>a time slot can only be booked once</strong>, and guests can book without
              registering.
            </p>
          </div>
          {!loading && counsellors.length > 0 && <Badge status="published">{counsellors.length} counsellor(s) available</Badge>}
        </div>

        {loading ? (
          <LoadingBlock label="Loading counsellors..." />
        ) : counsellors.length === 0 ? (
          <Card className="mt-8 p-12 text-center text-muted">
            No counsellors are available right now. Please{" "}
            <Link to="/contact" className="font-semibold text-primary">
              contact the institute
            </Link>{" "}
            to arrange support.
          </Card>
        ) : (
          <Card className="mt-6 p-6 sm:p-8">
            {/* step indicator */}
            <ol className="mb-7 flex flex-wrap gap-2">
              {STEPS.map((label, i) => {
                const n = i + 1;
                const active = step === n;
                const complete = step > n || !!done;
                return (
                  <li key={label}>
                    <button
                      type="button"
                      disabled={!!done || n > step}
                      onClick={() => !done && n < step && reset(n)}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-primary bg-primary text-white"
                          : complete
                            ? "border-success/40 bg-success/10 text-success"
                            : "border-border bg-surface2 text-muted"
                      } ${!done && n < step ? "hover:border-primary" : ""}`}
                    >
                      <span className={`grid h-5 w-5 place-items-center rounded-full ${active ? "bg-white/25" : "bg-surface"}`}>
                        {complete && !active ? "✓" : n}
                      </span>
                      {label}
                    </button>
                  </li>
                );
              })}
            </ol>

            {error && (
              <div className="mb-4">
                <Alert type="error">{error}</Alert>
              </div>
            )}

            {/* ---------------- step 1: counsellor ---------------- */}
            {step === 1 && (
              <div className="grid gap-4 md:grid-cols-2">
                {counsellors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickCounsellor(c)}
                    disabled={(c.upcoming_slots || 0) === 0}
                    className="rounded-2xl border border-border bg-surface2/60 p-5 text-left transition enabled:hover:border-primary enabled:hover:shadow-soft disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-extrabold text-white">
                        {c.avatar_url ? (
                          <img src={c.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                        ) : (
                          initials(c.name)
                        )}
                      </span>
                      <div>
                        <p className="font-bold">{c.name}</p>
                        <p className="text-sm text-muted">{c.specialty || "Counsellor"}</p>
                      </div>
                    </div>
                    {c.bio && <p className="mt-3 line-clamp-2 text-sm text-muted">{c.bio}</p>}
                    {weeklyLabel(c.weekly).length > 0 && (
                      <p className="mt-3 text-xs font-semibold text-ink">
                        {weeklyLabel(c.weekly).join(" · ")}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                      <span className="badge bg-primary/10 text-primary">
                        {c.upcoming_slots || 0} free slot{(c.upcoming_slots || 0) === 1 ? "" : "s"}
                      </span>
                      {c.next_available && <span className="text-muted">Next: {when(c.next_available)}</span>}
                      {(c.upcoming_slots || 0) === 0 && <span className="text-danger">Fully booked</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ---------------- step 2: date picker ---------------- */}
            {step === 2 && counsellor && (
              <div className="mx-auto max-w-xl">
                <button type="button" className="btn-ghost mb-4 gap-1 text-sm" onClick={() => reset(1)}>
                  <ArrowLeft className="h-4 w-4" /> Choose a different counsellor
                </button>
                <h3 className="font-bold">
                  When would you like to meet <span className="text-primary">{counsellor.name}</span>?
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Pick a date from the calendar - days with free slots are highlighted, fully booked days stay visible
                  but cannot be taken.
                </p>

                {dates.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">
                    No sessions in the next two months - check back soon or pick another counsellor.
                  </p>
                ) : (
                  <>
                    <div className="mt-5 flex items-center justify-between">
                      <button
                        type="button"
                        className="btn-ghost h-9 w-9 !p-0"
                        disabled={view <= monthStart}
                        onClick={() => shiftMonth(-1)}
                        aria-label="Previous month"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <p className="font-bold">{view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
                      <button
                        type="button"
                        className="btn-ghost h-9 w-9 !p-0"
                        disabled={view >= nextMonthStart}
                        onClick={() => shiftMonth(1)}
                        aria-label="Next month"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-muted">
                      {DAY_NAMES.map((d) => (
                        <span key={d} className="py-1">
                          {d}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1.5">
                      {cells.map((key, i) => {
                        if (!key) return <span key={`empty-${i}`} aria-hidden />;
                        const info = dateMap.get(key);
                        const free = info?.free ?? 0;
                        const total = info?.total ?? free;
                        const has = !!info && total > 0;
                        const full = has && free === 0;
                        const isToday = key === ymd(today);
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={!has}
                            onClick={() => pickDate(key)}
                            className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-sm transition ${
                              full
                                ? "cursor-not-allowed border-border bg-surface2 text-muted"
                                : has
                                  ? "border-primary/40 bg-primary/5 font-bold text-ink enabled:hover:border-primary enabled:hover:shadow-soft"
                                  : "cursor-default border-transparent text-muted/40"
                            } ${isToday ? "ring-2 ring-accent/60" : ""}`}
                          >
                            <span>{Number(key.slice(8))}</span>
                            <span className="text-[10px] leading-tight">
                              {full ? (
                                <span className="text-danger">full</span>
                              ) : has ? (
                                <span className="text-primary">{free} free</span>
                              ) : (
                                <span>&nbsp;</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <p className="mt-4 text-center text-xs text-muted">
                      Only days with sessions are shown. A date keeps all of its times visible - booked ones are
                      disabled when you get there.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ---------------- step 3: time slot ---------------- */}
            {step === 3 && counsellor && date && (
              <div>
                <button type="button" className="btn-ghost mb-4 gap-1 text-sm" onClick={() => reset(2)}>
                  <ArrowLeft className="h-4 w-4" /> Change the date
                </button>
                <h3 className="font-bold">All sessions on {dateLabel(date)}</h3>
                <p className="mt-1 text-sm text-muted">
                  Every session that day is listed - times that are already taken stay visible but cannot be selected.
                </p>
                {slots.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">
                    Nothing is scheduled on this day - go back and pick another date.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {slots.map((s) => (
                      <button
                        key={s.start}
                        type="button"
                        disabled={!s.available}
                        onClick={() => pickSlot(s)}
                        className="rounded-xl border border-border bg-surface2/60 p-4 text-left transition enabled:hover:border-primary enabled:hover:shadow-soft disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-lg font-extrabold text-primary">
                            <Clock className="h-4 w-4" /> {timeLabel(s.start)}
                          </span>
                          <span className="text-sm font-bold">{price(s.price, s.currency)}</span>
                        </div>
                        <p className="mt-1 line-clamp-1 font-semibold">{s.title}</p>
                        <p className="mt-1 text-xs text-muted">
                          {s.duration_min} min ·{" "}
                          {s.available
                            ? `${s.seats_left} of ${s.capacity} seat${s.capacity === 1 ? "" : "s"} free`
                            : "fully booked"}
                        </p>
                        {!s.available && (
                          <p className="mt-1 text-xs font-semibold text-danger">Unavailable - already booked</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ---------------- step 4: mode ---------------- */}
            {step === 4 && slot && (
              <div>
                <button type="button" className="btn-ghost mb-4 gap-1 text-sm" onClick={() => reset(3)}>
                  <ArrowLeft className="h-4 w-4" /> Change the time
                </button>
                <h3 className="font-bold">How would you like to meet?</h3>
                <p className="mt-1 text-sm text-muted">
                  {slot.title} · {when(slot.start)}
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {modeOptions.includes("online") && (
                    <button
                      type="button"
                      onClick={() => pickMode("online")}
                      className={`rounded-2xl border p-5 text-left transition hover:shadow-soft ${
                        mode === "online" ? "border-primary bg-primary/5 ring-2 ring-primary" : "border-border bg-surface2/60"
                      }`}
                    >
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Video className="h-5 w-5" />
                      </span>
                      <p className="mt-3 font-bold">Online (Zoom)</p>
                      <p className="mt-1 text-sm text-muted">
                        A Zoom meeting is created for you - the join link appears right after booking.
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                        Select <ArrowRight className="h-4 w-4" />
                      </span>
                    </button>
                  )}
                  {modeOptions.includes("in_person") && (
                    <button
                      type="button"
                      onClick={() => pickMode("in_person")}
                      className={`rounded-2xl border p-5 text-left transition hover:shadow-soft ${
                        mode === "in_person" ? "border-primary bg-primary/5 ring-2 ring-primary" : "border-border bg-surface2/60"
                      }`}
                    >
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <MapPin className="h-5 w-5" />
                      </span>
                      <p className="mt-3 font-bold">In person</p>
                      <p className="mt-1 text-sm text-muted">
                        {slot.location || "At the institute centre"} - arrive a few minutes early.
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                        Select <ArrowRight className="h-4 w-4" />
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ---------------- step 5: details ---------------- */}
            {step === 5 && slot && counsellor && (
              <div>
                <button type="button" className="btn-ghost mb-4 gap-1 text-sm" onClick={() => reset(4)}>
                  <ArrowLeft className="h-4 w-4" /> Change the mode
                </button>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="font-bold">Your details</h3>
                    {!user && (
                      <p className="mt-1 mb-3 text-xs text-muted">
                        Booking as a guest - no account needed.{" "}
                        <Link to="/login" className="font-semibold text-primary">
                          Sign in
                        </Link>{" "}
                        to track it from your dashboard.
                      </p>
                    )}
                    <div className="mt-3 space-y-3">
                      <Field label="Your name">
                        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" required />
                      </Field>
                      <Field label="Email" hint="Confirmation and the Zoom link are sent here.">
                        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Phone (optional)">
                          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+94 7x xxx xxxx" />
                        </Field>
                        <Field label="Topic (optional)">
                          <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. exam stress" />
                        </Field>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface2/60 p-5">
                    <h3 className="font-bold">Your booking</h3>
                    <ul className="mt-3 space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <HeartHandshake className="h-4 w-4 shrink-0 text-primary" /> {counsellor.name}
                      </li>
                      <li className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 shrink-0 text-primary" /> {dateLabel(date || dateKey(slot.start))}
                      </li>
                      <li className="flex items-center gap-2">
                        <Clock className="h-4 w-4 shrink-0 text-primary" /> {timeLabel(slot.start)} · {slot.duration_min} min
                      </li>
                      <li className="flex items-center gap-2">
                        {mode === "online" ? (
                          <Video className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <MapPin className="h-4 w-4 shrink-0 text-primary" />
                        )}
                        {mode === "online" ? "Online (Zoom)" : slot.location || "In person"}
                      </li>
                      <li className="flex items-center gap-2">
                        <Users className="h-4 w-4 shrink-0 text-primary" /> {slot.title}
                      </li>
                    </ul>
                    <p className="mt-4 text-2xl font-extrabold text-primary">{price(slot.price, slot.currency)}</p>
                    <p className="text-xs text-muted">
                      {slot.price > 0 ? "Payable at the session / by transfer." : "No payment needed."}
                    </p>
                    <Button
                      className="mt-5 w-full"
                      loading={busy}
                      disabled={!form.name.trim() || !form.email.trim()}
                      onClick={submit}
                    >
                      Confirm booking
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- confirmation ---------------- */}
            {done && (
              <div className="text-center">
                <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
                <h3 className="mt-4 text-2xl font-extrabold">You are booked in</h3>
                <p className="mt-2 text-muted">
                  {when(done.slot_start)} · {done.duration_min} min · {done.counsellor_name}
                </p>

                <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-border bg-surface2/60 p-5 text-left text-sm">
                  <div className="flex flex-wrap justify-between gap-2 border-b border-border pb-3">
                    <span className="font-semibold">Session</span>
                    <span>{done.title}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-b border-border py-3">
                    <span className="font-semibold">Name</span>
                    <span>{done.name}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-b border-border py-3">
                    <span className="font-semibold">Email</span>
                    <span>{done.email}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-b border-border py-3">
                    <span className="font-semibold">Mode</span>
                    <span>{done.mode === "in_person" ? "In person" : "Online (Zoom)"}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 pt-3">
                    <span className="font-semibold">Reference</span>
                    <span className="break-all font-mono">{done.id}</span>
                  </div>
                </div>

                {done.mode === "online" &&
                  (done.join_url ? (
                    <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left">
                      <p className="flex items-center gap-2 font-semibold">
                        <Video className="h-4 w-4 text-primary" /> Your Zoom meeting
                      </p>
                      <a
                        href={done.join_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block break-all text-sm font-semibold text-primary underline"
                      >
                        {done.join_url}
                      </a>
                      {done.meeting_password && (
                        <p className="mt-1 text-xs text-muted">Passcode: {done.meeting_password}</p>
                      )}
                      <Button variant="soft" className="mt-3" onClick={copyLink}>
                        <Copy className="h-4 w-4" /> {copied ? "Copied!" : "Copy link"}
                      </Button>
                    </div>
                  ) : (
                    <div className="mx-auto mt-4 max-w-xl text-left">
                      <Alert type="info">
                        {done.meeting_note || "The online meeting link will be emailed to you before the session."}
                      </Alert>
                    </div>
                  ))}

                {done.mode === "in_person" && (
                  <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-border bg-surface2/60 p-4 text-left text-sm">
                    <p className="flex items-center gap-2 font-semibold">
                      <MapPin className="h-4 w-4 text-primary" /> Venue
                    </p>
                    <p className="mt-1 text-muted">{done.venue || done.location || "At the institute centre"}</p>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button onClick={() => reset(1)}>Book another session</Button>
                  {user && (
                    <Link to="/dashboard/counselling" className="btn-ghost">
                      My sessions
                    </Link>
                  )}
                  <Link to="/" className="btn-ghost">
                    Back to home
                  </Link>
                </div>
              </div>
            )}
          </Card>
        )}
      </section>

      {/* browse everything */}
      {!loading && upcoming.length > 0 && (
        <section className="container-x pb-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Next available slots</h2>
              <p className="mt-1 text-sm text-muted">
                Prefer to browse first? Pick any free time to jump straight into the booking steps.
              </p>
            </div>
            <Badge status="published">Open for booking</Badge>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((s) => (
              <Card key={`${s.schedule_id}-${s.start}`} className="flex flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <Badge status={s.mode === "in_person" ? "published" : "in_progress"}>
                    {s.mode === "both" ? "Online & in person" : s.mode === "online" ? "Online" : "In person"}
                  </Badge>
                  <span className="text-sm font-bold text-primary">{price(s.price, s.currency)}</span>
                </div>
                <h3 className="mt-3 font-bold">{s.title}</h3>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted">
                  {s.description || "Confidential session with a qualified counsellor."}
                </p>
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
                  <HeartHandshake className="h-4 w-4 text-primary" /> {s.counsellor_name}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  <li className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0 text-primary" /> {when(s.start)}
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-primary" /> {s.duration_min} minutes
                  </li>
                  <li className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-primary" /> {s.seats_left} of {s.capacity} seat
                    {s.capacity === 1 ? "" : "s"} free
                  </li>
                </ul>
                <Button className="mt-4 w-full" disabled={!s.available} onClick={() => jumpToSlot(s)}>
                  Book this time
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="container-x pb-16">
        <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-2xl border border-border bg-surface2 p-4 text-sm text-muted">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          <p>
            Bookings are private. Online sessions run on Zoom (link shown after booking and emailed to you); in-person
            sessions are held at the centre. Paid sessions are settled at the session or by transfer - the institute
            confirms your slot by email.{" "}
            {user ? (
              <Link to="/dashboard/counselling" className="font-semibold text-primary">
                See my bookings
              </Link>
            ) : (
              <>
                Already booked?{" "}
                <Link to="/login" className="font-semibold text-primary">
                  Sign in
                </Link>{" "}
                to track it.
              </>
            )}
          </p>
        </div>
      </section>
    </>
  );
}
