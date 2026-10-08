import { useEffect, useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2, Users } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useRealtime } from "../../lib/realtime";
import type { CounsellingBooking, CounsellingSchedule } from "../../lib/types";
import { useAuth } from "../../store/auth";
import { Alert, Badge, Button, Card, Field, Input, LoadingBlock, Modal, Select, Table, Textarea } from "../../components/ui";

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const empty = {
  title: "",
  description: "",
  weekdays: [0, 1, 2, 3, 4] as number[],
  start_time: "09:00",
  count: 5,
  slot_minutes: 30,
  mode: "both",
  capacity: 1,
  price: 0,
  currency: "USD",
  location: "",
  status: "active",
};

const toMin = (t: string) => {
  const [h, m] = String(t || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");

const fmtMin = (total: number) => `${pad(total / 60)}:${pad(total % 60)}`;

const sessionsPerDay = (start: string, end: string, slot: number) =>
  Math.max(0, Math.round((toMin(end) - toMin(start)) / Math.max(1, slot)));

const when = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

const modeLabel = (m?: string | null) =>
  m === "both" ? "Online & in person" : (m || "").replace("_", " ");

const hours = (s: CounsellingSchedule) => {
  const days = (s.weekdays || []).map((d) => DAYS_SHORT[d] ?? "").filter(Boolean).join(", ") || "?";
  const perDay = sessionsPerDay(s.start_time, s.end_time, s.slot_minutes);
  return `${days} · ${s.start_time}-${s.end_time} · ${s.slot_minutes} min × ${perDay}/day`;
};

export default function AdminCounselling() {
  const { settings, user } = useAuth();
  const [items, setItems] = useState<CounsellingSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty, currency: settings?.currency || "USD" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [bookings, setBookings] = useState<CounsellingBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsFor, setBookingsFor] = useState<CounsellingSchedule | null>(null);
  const [toDelete, setToDelete] = useState<CounsellingSchedule | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState({ specialty: "", bio: "" });

  const load = async () => {
    try {
      const [schedules, allBookings] = await Promise.all([
        api.get<CounsellingSchedule[]>("/counselling/my-schedules"),
        api.get<CounsellingBooking[]>("/counselling/bookings?limit=50"),
      ]);
      setItems(schedules);
      setBookings(allBookings);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your schedule");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime((event) => {
    if (event.startsWith("counselling.")) load();
  });

  const openCreate = () => {
    setEditId(null);
    setError("");
    setForm({ ...empty, weekdays: [0, 1, 2, 3, 4], currency: settings?.currency || "USD" });
    setStep(1);
    setOpen(true);
  };

  const openEdit = (s: CounsellingSchedule) => {
    setEditId(s.id);
    setError("");
    setForm({
      title: s.title,
      description: s.description || "",
      weekdays: (s.weekdays || []).length ? [...s.weekdays] : [0],
      start_time: s.start_time,
      count: sessionsPerDay(s.start_time, s.end_time, s.slot_minutes) || 1,
      slot_minutes: s.slot_minutes,
      mode: s.mode,
      capacity: s.capacity,
      price: s.price,
      currency: s.currency || settings?.currency || "USD",
      location: s.location || "",
      status: s.status,
    });
    setStep(1);
    setOpen(true);
  };

  const endTime = () => fmtMin(Math.min(1440, toMin(form.start_time) + form.count * form.slot_minutes));

  const slotTimes = () => {
    const start = toMin(form.start_time);
    const times: string[] = [];
    for (let i = 0; i < Math.max(0, form.count); i++) times.push(fmtMin(start + i * form.slot_minutes));
    return times;
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        weekdays: form.weekdays,
        start_time: form.start_time,
        end_time: endTime(),
        slot_minutes: Number(form.slot_minutes),
        mode: form.mode,
        capacity: Number(form.capacity),
        price: Number(form.price),
        currency: (form.currency || "USD").toUpperCase(),
        location: form.location.trim() || null,
        status: form.status,
      };
      if (editId) await api.patch(`/counselling/schedules/${editId}`, payload);
      else await api.post("/counselling/schedules", payload);
      setOpen(false);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the session");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.delete(`/counselling/schedules/${toDelete.id}`);
      setToDelete(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete");
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const openBookings = async (schedule: CounsellingSchedule | null) => {
    setBookingsFor(schedule);
    setBookingsLoading(true);
    setError("");
    try {
      const qs = schedule ? `?schedule_id=${schedule.id}&limit=200` : "?limit=50";
      setBookings(await api.get<CounsellingBooking[]>(`/counselling/bookings${qs}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load bookings");
    } finally {
      setBookingsLoading(false);
    }
  };

  const setBookingStatus = async (bookingId: string, status: "attended" | "cancelled" | "booked") => {
    try {
      await api.patch(`/counselling/bookings/${bookingId}`, { status });
      await openBookings(bookingsFor);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update booking");
    }
  };

  const step1Ok = form.title.trim().length >= 3 && Number(form.capacity) >= 1 && Number(form.slot_minutes) >= 10;
  const step2Ok =
    form.weekdays.length > 0 &&
    Number(form.count) >= 1 &&
    toMin(form.start_time) + Number(form.count) * Number(form.slot_minutes) <= 1440;
  const valid = step1Ok && step2Ok;

  const daysLabel =
    form.weekdays.length === 7
      ? "every day"
      : [...form.weekdays].sort().map((d) => DAYS_SHORT[d]).join(", ") || "no days chosen";

  const openProfile = () => {
    setProfile({ specialty: user?.specialty || "", bio: user?.bio || "" });
    setProfileOpen(true);
  };

  const saveProfile = async () => {
    setBusy(true);
    setError("");
    try {
      await api.patch("/auth/me", { specialty: profile.specialty, bio: profile.bio });
      setProfileOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save your profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Counselling</h1>
          <p className="text-sm text-muted">
            {user?.role === "admin"
              ? "Weekly sessions and bookings across all counsellors."
              : "Define your sessions for each day of the week - people book the free slots."}
          </p>
        </div>
        <div className="flex gap-2">
          {user?.role === "counselor" && (
            <Button variant="soft" onClick={openProfile}>
              My profile
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New session
          </Button>
        </div>
      </div>

      {error && !open && !bookingsFor && (
        <div className="mb-4">
          <Alert type="error">{error}</Alert>
        </div>
      )}

      <h2 className="mb-3 font-bold">Weekly schedule</h2>
      {loading ? (
        <LoadingBlock label="Loading schedule..." />
      ) : items.length === 0 ? (
        <Card className="p-12 text-center text-muted">
          No weekly sessions yet. Click <span className="font-semibold text-ink">New session</span> to define when you
          see people - the slots appear on the public page straight away.
        </Card>
      ) : (
        <Table headers={["Session", "When", "Mode", "Booked (30d)", "Free (14d)", "Price", "Status", ""]}>
          {items.map((s) => (
            <tr key={s.id} className="hover:bg-surface2/50">
              <td className="px-4 py-3">
                <p className="font-medium">{s.title}</p>
                <p className="text-xs text-muted">{s.counsellor_name}</p>
              </td>
              <td className="px-4 py-3 text-muted">{hours(s)}</td>
              <td className="px-4 py-3 capitalize">{modeLabel(s.mode)}</td>
              <td className="px-4 py-3">{s.upcoming_bookings || 0}</td>
              <td className="px-4 py-3">
                {s.free_next_14d || 0}
                {s.next_free && <span className="ml-1 text-xs text-muted">next {when(s.next_free)}</span>}
              </td>
              <td className="px-4 py-3">{s.price > 0 ? `${s.currency || "USD"} ${s.price}` : "Free"}</td>
              <td className="px-4 py-3">
                <Badge status={s.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5">
                  <Button variant="soft" onClick={() => openBookings(s)}>
                    <Users className="h-4 w-4" /> Bookings
                  </Button>
                  <Button variant="ghost" onClick={() => openEdit(s)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="danger" onClick={() => setToDelete(s)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Bookings</h2>
          <p className="text-sm text-muted">Soonest first - mark people attended after their session.</p>
        </div>
        <Button variant="soft" onClick={() => openBookings(null)}>
          <CalendarClock className="h-4 w-4" /> Refresh
        </Button>
      </div>
      <Card className="mt-3">
        {bookingsLoading ? (
          <LoadingBlock label="Loading bookings..." />
        ) : bookings.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">No bookings yet.</p>
        ) : (
          <Table headers={["When", "Name", "Email", "Phone", "Mode", "Meeting / venue", "Status", ""]}>
            {bookings.map((b) => (
              <tr key={b.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3 text-muted">{when(b.slot_start)}</td>
                <td className="px-4 py-3 font-medium">{b.name}</td>
                <td className="px-4 py-3 text-muted">{b.email}</td>
                <td className="px-4 py-3 text-muted">{b.phone || "-"}</td>
                <td className="px-4 py-3 capitalize">{b.mode === "in_person" ? "In person" : "Online"}</td>
                <td className="px-4 py-3 text-muted">
                  {b.mode === "in_person" ? (
                    <span>{b.venue || b.location || "-"}</span>
                  ) : b.join_url ? (
                    <a href={b.join_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      Join link
                    </a>
                  ) : (
                    <span>{b.meeting_note || "Link pending"}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge status={b.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    {b.status !== "attended" && b.status !== "cancelled" && (
                      <Button variant="soft" onClick={() => setBookingStatus(b.id, "attended")}>
                        Mark attended
                      </Button>
                    )}
                    {b.status !== "cancelled" && (
                      <Button variant="ghost" onClick={() => setBookingStatus(b.id, "cancelled")}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="My counsellor profile">
        {error && (
          <div className="mb-4">
            <Alert type="error">{error}</Alert>
          </div>
        )}
        <p className="mb-4 text-sm text-muted">Your profile is shown in the counsellor list on the public counselling page.</p>
        <div className="space-y-4">
          <Field label="Specialty">
            <Input value={profile.specialty} onChange={(e) => setProfile({ ...profile, specialty: e.target.value })} placeholder="e.g. Exam stress & career guidance" />
          </Field>
          <Field label="Profile">
            <Textarea value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} placeholder="Who you help and how you work." />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setProfileOpen(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={saveProfile}>
            Save profile
          </Button>
        </div>
      </Modal>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit session" : step === 1 ? "New session - length & details" : "New session - schedule it"}
        wide
      >
        {error && (
          <div className="mb-4">
            <Alert type="error">{error}</Alert>
          </div>
        )}

        <ol className="mb-5 flex items-center gap-2 text-xs font-semibold">
          {[`1. Session length`, `2. Days & times`].map((label, i) => {
            const n = i + 1;
            return (
              <li key={label}>
                <span
                  className={`inline-block rounded-full border px-3 py-1 ${
                    step === n ? "border-primary bg-primary text-white" : step > n ? "border-success/40 bg-success/10 text-success" : "border-border bg-surface2 text-muted"
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        {step === 1 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Title">
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Morning one-to-one" />
              </Field>
            </div>
            <Field label="Session length" hint="How long one appointment lasts - each slot is one session.">
              <Select value={form.slot_minutes} onChange={(e) => setForm({ ...form, slot_minutes: Number(e.target.value) })}>
                {[15, 20, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m === 60 ? "1 hour" : m === 90 ? "1.5 hours" : `${m} minutes`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mode" hint="Online bookings get a Zoom meeting created automatically.">
              <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="both">Online &amp; in person</option>
                <option value="online">Online only (Zoom)</option>
                <option value="in_person">In person only</option>
              </Select>
            </Field>
            <Field label="Seats per slot" hint="1 = one-to-one, a slot is gone once booked.">
              <Input type="number" min={1} max={20} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            </Field>
            <Field label="Price" hint="0 = free">
              <Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </Field>
            <Field label="Currency">
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active (bookable)</option>
                <option value="paused">Paused (hidden)</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Location / venue" hint="Used for in-person bookings.">
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Homagama Centre, Godagama" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Description">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Who are these sessions for?" />
              </Field>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold">Repeat on these days</p>
              <div className="flex flex-wrap gap-2">
                {DAYS_SHORT.map((label, day) => {
                  const on = form.weekdays.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          weekdays: on ? form.weekdays.filter((d) => d !== day) : [...form.weekdays, day].sort((a, b) => a - b),
                        })
                      }
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        on ? "border-primary bg-primary text-white" : "border-border bg-surface2/60 text-muted hover:border-primary"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start time">
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </Field>
              <Field label="Sessions per day" hint={`${form.slot_minutes} min each - e.g. 5 × 1 hr = 09:00 to 14:00.`}>
                <Input
                  type="number"
                  min={1}
                  max={Math.max(1, Math.floor((1440 - toMin(form.start_time)) / form.slot_minutes))}
                  value={form.count}
                  onChange={(e) => setForm({ ...form, count: Math.max(1, Number(e.target.value) || 1) })}
                />
              </Field>
            </div>
            <div className="rounded-2xl border border-border bg-surface2/60 p-4 text-sm">
              <p className="font-semibold">
                {form.weekdays.length ? `Repeats on ${daysLabel}` : "Pick at least one day"}
              </p>
              <p className="mt-1 text-muted">
                {form.start_time} - {endTime()} · {form.slot_minutes} min each · {form.count} session
                {form.count === 1 ? "" : "s"} per day
              </p>
              {step2Ok && (
                <p className="mt-2 font-mono text-xs text-ink">{slotTimes().join("  ·  ")}</p>
              )}
              <p className="mt-2 text-xs text-muted">
                Each day gets its own repeating slots - people book them from the public page, and a booked slot is
                blocked for everyone else.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => (step === 1 ? setOpen(false) : setStep(1))}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step === 1 ? (
            <Button
              disabled={!step1Ok}
              onClick={() => {
                setError("");
                setStep(2);
              }}
            >
              Next: schedule it
            </Button>
          ) : (
            <Button loading={busy} disabled={!valid} onClick={save}>
              {editId ? "Save changes" : "Publish session"}
            </Button>
          )}
        </div>
      </Modal>

      <Modal
        open={!!bookingsFor}
        onClose={() => setBookingsFor(null)}
        title={bookingsFor ? `Bookings - ${bookingsFor.title}` : "All bookings"}
        wide
      >
        {bookingsLoading ? (
          <LoadingBlock label="Loading bookings..." />
        ) : bookings.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No bookings yet.</p>
        ) : (
          <Table headers={["When", "Name", "Email", "Phone", "Mode", "Meeting / venue", "Status", ""]}>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3 text-muted">{when(b.slot_start)}</td>
                <td className="px-4 py-3 font-medium">{b.name}</td>
                <td className="px-4 py-3 text-muted">{b.email}</td>
                <td className="px-4 py-3 text-muted">{b.phone || "-"}</td>
                <td className="px-4 py-3 capitalize">{b.mode === "in_person" ? "In person" : "Online"}</td>
                <td className="px-4 py-3 text-muted">
                  {b.mode === "in_person" ? (
                    <span>{b.venue || b.location || "-"}</span>
                  ) : b.join_url ? (
                    <a href={b.join_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      Join link
                    </a>
                  ) : (
                    <span>{b.meeting_note || "Link pending"}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge status={b.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    {b.status !== "attended" && b.status !== "cancelled" && (
                      <Button variant="soft" onClick={() => setBookingStatus(b.id, "attended")}>
                        Mark attended
                      </Button>
                    )}
                    {b.status !== "cancelled" && (
                      <Button variant="ghost" onClick={() => setBookingStatus(b.id, "cancelled")}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={() => setBookingsFor(null)}>
            Close
          </Button>
        </div>
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete session">
        <p className="text-sm text-muted">
          Delete <span className="font-semibold text-ink">{toDelete?.title}</span>
          {toDelete ? ` (${hours(toDelete)})` : ""}? Every booking made for it is removed too. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setToDelete(null)}>
            Keep session
          </Button>
          <Button variant="danger" loading={busy} onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
