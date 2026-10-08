import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  BadgeDollarSign,
  BookOpen,
  CalendarClock,
  CheckSquare,
  FileText,
  HeartHandshake,
  Inbox,
  MessageSquare,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { api } from "../../lib/api";
import type { AdminDashboard as AD, StaffDashboard as SD, CounsellingBooking } from "../../lib/types";
import { useAuth } from "../../store/auth";
import { Badge, Card, LoadingBlock, StatCard, Table } from "../../components/ui";
import { useRealtime } from "../../lib/realtime";

function AdminDash() {
  const [data, setData] = useState<AD | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AD>("/dashboard/admin")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useRealtime((event) => {
    if (["payment.created", "payment.updated", "enrolment.created"].includes(event)) {
      api.get<AD>("/dashboard/admin").then(setData).catch(() => {});
    }
  });

  if (loading || !data) return <LoadingBlock />;

  const s = data.stats as Record<string, number>;
  const revenueByCur = (data.stats.revenue_by_currency as Record<string, number>) || {};

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Admin Dashboard</h1>
        <p className="text-sm text-muted">Overview of programmes, students, payments and certificates.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={s.total_students || 0} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Programmes" value={`${s.published_programmes || 0}/${s.total_programmes || 0}`} icon={<BookOpen className="h-5 w-5" />} accent="from-accent to-primary2" />
        <StatCard label="Active Enrolments" value={s.active_enrolments || 0} icon={<BadgeDollarSign className="h-5 w-5" />} accent="from-success to-accent" />
        <StatCard label="Certificates" value={s.certificates || 0} icon={<Award className="h-5 w-5" />} accent="from-warning to-danger" />
        <StatCard label="Pending Verifications" value={s.pending_verifications || 0} icon={<Wallet className="h-5 w-5" />} accent="from-warning to-warning" />
        <StatCard label="Grading Queue" value={s.grading_queue || 0} icon={<CheckSquare className="h-5 w-5" />} accent="from-primary to-accent" />
        <StatCard label="New Messages" value={s.new_messages || 0} icon={<MessageSquare className="h-5 w-5" />} accent="from-danger to-warning" />
        <StatCard
          label="Revenue (30d)"
          value={Object.entries(revenueByCur).map(([c, v]) => `${c} ${Math.round(v)}`).join(" · ") || `USD ${Math.round((s.revenue_30d as number) || 0)}`}
          icon={<Inbox className="h-5 w-5" />}
          accent="from-success to-primary"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Enrolment trend (30 days)</h2>
            <Link to="/admin/enrolments" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="flex h-40 items-end gap-1.5">
            {data.enrolment_trend.length === 0 && (
              <p className="text-sm text-muted">No enrolments in this period.</p>
            )}
            {data.enrolment_trend.map((d) => {
              const max = Math.max(...data.enrolment_trend.map((x) => x.count), 1);
              return (
                <div key={d.date} className="group relative flex-1">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-primary to-accent transition group-hover:opacity-80"
                    style={{ height: `${(d.count / max) * 140}px`, minHeight: 4 }}
                    title={`${d.date}: ${d.count}`}
                  />
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Quick actions</h2>
          </div>
          <div className="grid gap-2">
            <Link to="/admin/programmes" className="btn-ghost justify-start">Manage Programmes</Link>
            <Link to="/admin/payments" className="btn-ghost justify-start">Verify Payments</Link>
            <Link to="/admin/grading" className="btn-ghost justify-start">Grade Essays</Link>
            <Link to="/admin/certificates" className="btn-ghost justify-start">Issue Certificates</Link>
            <Link to="/admin/settings" className="btn-ghost justify-start">Institute Name / Logo</Link>
          </div>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-bold">Recent payments</h2>
        <Table headers={["User", "Amount", "Provider", "Purpose", "Status", "Date"]}>
          {data.recent_payments.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3">
                <p className="font-medium">{p.user?.name || "—"}</p>
                <p className="text-xs text-muted">{p.user?.email}</p>
              </td>
              <td className="px-4 py-3 font-semibold">
                {p.currency} {p.amount}
              </td>
              <td className="px-4 py-3 capitalize">{p.provider}</td>
              <td className="px-4 py-3 capitalize">{p.purpose}</td>
              <td className="px-4 py-3">
                <Badge status={p.status} />
              </td>
              <td className="px-4 py-3 text-muted">
                {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}

function LecturerDash() {
  const [data, setData] = useState<SD | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<SD>("/dashboard/staff")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useRealtime((event) => {
    if (["enrolment.created", "live.changed"].includes(event)) {
      api.get<SD>("/dashboard/staff").then(setData).catch(() => {});
    }
  });

  if (loading || !data) return <LoadingBlock />;

  const s = data.stats;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Lecturer Dashboard</h1>
        <p className="text-sm text-muted">Your programmes, classes, grading and certificates.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Programmes" value={`${s.published_programmes || 0}/${s.total_programmes || 0}`} icon={<BookOpen className="h-5 w-5" />} accent="from-accent to-primary2" />
        <StatCard label="Students" value={s.total_students || 0} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Grading Queue" value={s.grading_queue || 0} icon={<CheckSquare className="h-5 w-5" />} accent="from-primary to-accent" />
        <StatCard label="Assignment Submissions" value={s.pending_submissions || 0} icon={<Upload className="h-5 w-5" />} accent="from-warning to-warning" />
        <StatCard label="Upcoming Live Classes" value={s.upcoming_sessions || 0} icon={<CalendarClock className="h-5 w-5" />} accent="from-success to-accent" />
        <StatCard label="Lessons" value={s.total_lessons || 0} icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Certificates" value={s.certificates || 0} icon={<Award className="h-5 w-5" />} accent="from-warning to-danger" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Recent programmes</h2>
            <Link to="/admin/programmes" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {data.recent_programmes.length === 0 ? (
            <p className="text-sm text-muted">No programmes yet — create your first class or course.</p>
          ) : (
            <Table headers={["Programme", "Type", "Status", "Students", "Exams", ""]}>
              {data.recent_programmes.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium">{p.title}</td>
                  <td className="px-4 py-3 capitalize">{p.type}</td>
                  <td className="px-4 py-3">
                    <Badge status={p.status} />
                  </td>
                  <td className="px-4 py-3">{p.student_count || 0}</td>
                  <td className="px-4 py-3">{p.exam_count || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/programmes/${p.id}`} className="text-sm text-primary hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4">
            <h2 className="font-bold">Quick actions</h2>
          </div>
          <div className="grid gap-2">
            <Link to="/admin/programmes" className="btn-ghost justify-start">Manage Programmes</Link>
            <Link to="/admin/grading" className="btn-ghost justify-start">Grade Exams</Link>
            <Link to="/admin/results" className="btn-ghost justify-start">Results</Link>
            <Link to="/admin/certificates" className="btn-ghost justify-start">Certificates</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

interface CounselorDashboard {
  stats: Record<string, number>;
  next_bookings: CounsellingBooking[];
  recent_bookings: CounsellingBooking[];
}

const sessionWhen = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

function CounselorDash() {
  const [data, setData] = useState<CounselorDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<CounselorDashboard>("/counselling/stats")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useRealtime((event) => {
    if (event.startsWith("counselling.")) {
      api.get<CounselorDashboard>("/counselling/stats").then(setData).catch(() => {});
    }
  });

  if (loading || !data) return <LoadingBlock />;

  const s = data.stats;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Counselling Dashboard</h1>
        <p className="text-sm text-muted">Your weekly schedule, free slots and upcoming appointments.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Sessions" value={s.active_schedules || 0} icon={<HeartHandshake className="h-5 w-5" />} />
        <StatCard label="Free Slots (14 days)" value={s.open_slots || 0} icon={<CalendarClock className="h-5 w-5" />} accent="from-success to-accent" />
        <StatCard label="Upcoming Bookings" value={s.upcoming_bookings || 0} icon={<Users className="h-5 w-5" />} accent="from-accent to-primary2" />
        <StatCard label="Attended" value={s.attended || 0} icon={<Award className="h-5 w-5" />} accent="from-warning to-danger" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Next appointments</h2>
            <Link to="/admin/counselling" className="text-sm text-primary hover:underline">
              Manage schedule
            </Link>
          </div>
          {data.next_bookings.length === 0 ? (
            <p className="text-sm text-muted">
              No bookings yet. Your weekly sessions are live on the public page - free slots show up here as soon as
              someone books.
            </p>
          ) : (
            <Table headers={["When", "Client", "Mode", "Status", ""]}>
              {data.next_bookings.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3 text-muted">{sessionWhen(b.slot_start)}</td>
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3 capitalize">{(b.mode || "").replace("_", " ")}</td>
                  <td className="px-4 py-3">
                    <Badge status={b.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/admin/counselling" className="text-sm text-primary hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Recent bookings</h2>
            </div>
            {data.recent_bookings.length === 0 ? (
              <p className="text-sm text-muted">No bookings yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {data.recent_bookings.slice(0, 6).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <span className="font-semibold">{b.name}</span>
                      <span className="block truncate text-muted">{b.title || ""}</span>
                    </span>
                    <Badge status={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4">
              <h2 className="font-bold">Quick actions</h2>
            </div>
            <div className="grid gap-2">
              <Link to="/admin/counselling" className="btn-ghost justify-start">Manage Schedule</Link>
              <Link to="/counselling" className="btn-ghost justify-start">View Public Page</Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  if (user?.role === "admin") return <AdminDash />;
  if (user?.role === "counselor") return <CounselorDash />;
  return <LecturerDash />;
}
