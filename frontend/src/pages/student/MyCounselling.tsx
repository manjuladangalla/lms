import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Clock, HeartHandshake, MapPin, Video } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useRealtime } from "../../lib/realtime";
import type { CounsellingBooking } from "../../lib/types";
import { Alert, Badge, Button, Card, EmptyState, LoadingBlock } from "../../components/ui";
import { StudentHeader } from "./Exams";

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

function BookingCard({ b, onCancelled }: { b: CounsellingBooking; onCancelled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cancel = async () => {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/counselling/bookings/${b.id}`, { status: "cancelled" });
      onCancelled();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel");
      setBusy(false);
    }
  };

  const upcoming = !b.is_past && b.status === "booked";
  const inPerson = b.mode === "in_person";

  return (
    <Card className="p-5">
      {error && (
        <div className="mb-3">
          <Alert type="error">{error}</Alert>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{b.title || "Counselling session"}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
            <HeartHandshake className="h-4 w-4 text-primary" /> {b.counsellor_name || "Counsellor"}
          </p>
        </div>
        <Badge status={b.status} />
      </div>

      <ul className="mt-3 space-y-1.5 text-sm text-muted">
        <li className="flex items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0 text-primary" /> {when(b.slot_start)}
        </li>
        <li className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-primary" /> {b.duration_min || 30} minutes
        </li>
        <li className="flex items-center gap-2">
          {inPerson ? <MapPin className="h-4 w-4 shrink-0 text-primary" /> : <Video className="h-4 w-4 shrink-0 text-primary" />}
          {inPerson ? b.venue || b.location || "At the centre" : "Online (Zoom)"}
        </li>
      </ul>

      {b.status === "booked" &&
        (b.mode === "in_person" ? null : b.join_url ? (
          <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-semibold">
              <Video className="h-4 w-4 text-primary" /> Zoom join link
            </p>
            <a href={b.join_url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-primary underline">
              {b.join_url}
            </a>
            {b.meeting_password && <p className="mt-1 text-xs text-muted">Passcode: {b.meeting_password}</p>}
          </div>
        ) : (
          <div className="mt-3 text-sm">
            <Alert type="info">{b.meeting_note || "The online link will be emailed before the session."}</Alert>
          </div>
        ))}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Reference <span className="font-mono text-ink">{b.id}</span>
        </p>
        {upcoming && (
          <Button variant="danger" loading={busy} onClick={cancel}>
            Cancel booking
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function MyCounselling() {
  const [items, setItems] = useState<CounsellingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setItems(await api.get<CounsellingBooking[]>("/counselling/my-bookings"));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your bookings");
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

  const upcoming = items.filter((b) => !b.is_past && b.status === "booked");
  const past = items.filter((b) => !( !b.is_past && b.status === "booked"));

  return (
    <div className="min-h-screen bg-bg">
      <StudentHeader title="My Counselling" />
      <div className="container-x py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">My counselling sessions</h1>
          <p className="text-sm text-muted">Sessions you booked - upcoming first.</p>
        </div>
        <Link to="/counselling" className="btn-ghost">
          Book another session
        </Link>
      </div>

      {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}

      {loading ? (
        <LoadingBlock label="Loading bookings..." />
      ) : items.length === 0 ? (
        <EmptyState
          title="No counselling sessions booked yet"
          subtitle="Book a private session - no account needed to book, and your details stay confidential."
          action={
            <Link to="/counselling" className="btn-primary mt-2">
              Book a session
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 font-bold">Upcoming</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {upcoming.map((b) => (
                  <BookingCard key={b.id} b={b} onCancelled={load} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 font-bold">Past &amp; cancelled</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {past.map((b) => (
                  <BookingCard key={b.id} b={b} onCancelled={load} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
