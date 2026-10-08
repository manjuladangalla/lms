import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, FileText, GraduationCap, Paperclip, Plus, Save, Trash2, Upload, Users, Video } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useRealtime } from "../../lib/realtime";
import type { Assignment, AssignmentSubmission, Exam, InstituteSettings, Lesson, LiveSession, Material, Programme, Question, Subject } from "../../lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Table,
  Textarea,
} from "../../components/ui";

type Tab = "curriculum" | "lessons" | "exams" | "live" | "assignments" | "settings";

const toLocalInput = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const toIso = (v: string): string | null => (v ? new Date(v).toISOString() : null);

const recurrenceLabel = (r?: string | null): string =>
  r === "daily" ? "Daily" : r === "weekly" ? "Weekly" : r === "monthly" ? "Monthly" : "";

const pricingLabel = (m?: string): string =>
  m === "subscription" ? "Time-limited" : m === "per_lesson" ? "Per lesson" : m === "per_module" ? "Per module" : "One-time";

const intervalLabel = (i?: string | null): string =>
  i === "weekly" ? "Weekly" : i === "semester" ? "Semester" : i === "yearly" ? "Yearly" : i === "monthly" ? "Monthly" : "";

interface Participant {
  user_id: string;
  name: string;
  email: string;
  role: string;
  blocked: boolean;
  payment_status: string;
  has_lesson_access: boolean;
  enrolments: { status: string; scope_key?: string; access_expires_at?: string | null; billing_interval?: string | null }[];
}

interface ResTarget {
  scope_type: "programme" | "subject" | "lesson";
  scope_id?: string;
  title: string;
  items: Material[];
}

export default function AdminProgrammeEdit() {
  const { id } = useParams();
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [tab, setTab] = useState<Tab>("curriculum");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [subjModal, setSubjModal] = useState(false);
  const [subjForm, setSubjForm] = useState({ title: "", description: "", is_free_preview: false, start_at: "", due_at: "", price: 0 });

  const [lessonModal, setLessonModal] = useState(false);
  const [lessonForm, setLessonForm] = useState({
    title: "", subject_id: "", content: "", video_url: "", duration_min: 10, is_free_preview: false,
    available_at: "", due_at: "", price: 0,
    with_live: false, live_start: "", live_duration: 60, live_provider: "zoom" as "zoom" | "manual", live_join_url: "",
  });
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);

  const [resTarget, setResTarget] = useState<ResTarget | null>(null);
  const [resForm, setResForm] = useState({ title: "", file_url: "" });
  const [resUploading, setResUploading] = useState(false);

  const [classSession, setClassSession] = useState<LiveSession | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  const [exams, setExams] = useState<Exam[]>([]);
  const [examModal, setExamModal] = useState(false);
  const [examForm, setExamForm] = useState({ title: "", type: "quiz", duration_min: 30, pass_marks: 0, max_attempts: 1, status: "draft", description: "", submission_mode: "online" as "online" | "file" | "both", paper_file_url: "", total_marks: 0 });
  const [paperUploading, setPaperUploading] = useState(false);
  const [examForQuestions, setExamForQuestions] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qModal, setQModal] = useState(false);
  const [qForm, setQForm] = useState<{ type: string; statement: string; options: string[]; correct_answer: string | string[]; marks: number }>({
    type: "mcq",
    statement: "",
    options: ["", ""],
    correct_answer: "",
    marks: 1,
  });

  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [liveModal, setLiveModal] = useState(false);
  const [liveForm, setLiveForm] = useState({
    title: "",
    description: "",
    start_time: "",
    duration_min: 60,
    provider: "zoom" as "zoom" | "manual",
    manual_join_url: "",
    passcode: "",
    create_zoom: true,
    recurrence: "none" as "none" | "daily" | "weekly" | "monthly",
    recurrence_until: "",
    lesson_id: "",
  });
  const [editLive, setEditLive] = useState<LiveSession | null>(null);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignModal, setAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ title: "", description: "", subject_id: "", due_at: "", max_marks: 100, status: "published" });
  const [editAssign, setEditAssign] = useState<Assignment | null>(null);
  const [gradeSub, setGradeSub] = useState<AssignmentSubmission | null>(null);
  const [gradeForm, setGradeForm] = useState({ score: 0, feedback: "" });
  const [subs, setSubs] = useState<AssignmentSubmission[]>([]);
  const [openSubsFor, setOpenSubsFor] = useState<Assignment | null>(null);

  const [settingsForm, setSettingsForm] = useState<Partial<Programme>>({});
  const [introUploading, setIntroUploading] = useState(false);
  const [currencies, setCurrencies] = useState<string[]>(["USD"]);

  const uploadIntro = async (file: File) => {
    setIntroUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("prefix", "programmes/intro");
      const r = await api.upload<{ url: string }>("/upload", fd);
      setSettingsForm((f) => ({ ...f, intro_video_url: r.url }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setIntroUploading(false);
    }
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const p = await api.get<Programme>(`/programmes/${id}`);
      setProgramme(p);
      setSettingsForm(p);
      const [ex, live, asg] = await Promise.all([
        api.get<Exam[]>(`/programmes/${id}/exams`),
        api.get<LiveSession[]>(`/programmes/${id}/live-sessions`).catch(() => []),
        api.get<Assignment[]>(`/programmes/${id}/assignments`).catch(() => []),
      ]);
      setExams(ex);
      setLiveSessions(live || []);
      setAssignments(asg || []);
      api
        .get<InstituteSettings>("/settings")
        .then((s) => {
          const list = (s.currencies || s.currency || "USD")
            .split(",")
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean);
          if (list.length) setCurrencies(list);
        })
        .catch(() => {});
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime((event, payload) => {
    if (event === "live.changed" && payload && payload.programme_id && payload.programme_id === id) {
      api.get<LiveSession[]>(`/programmes/${id}/live-sessions`).then(setLiveSessions).catch(() => {});
    }
  });

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const openQuestions = async (exam: Exam) => {
    setExamForQuestions(exam);
    const full = await api.get<Exam>(`/exams/${exam.id}`);
    setQuestions(full.questions || []);
    setQModal(true);
  };

  const openLive = (s?: LiveSession) => {
    if (s) {
      setEditLive(s);
      const st = s.start_time ? new Date(s.start_time) : null;
      const local = st ? new Date(st.getTime() - st.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
      setLiveForm({
        title: s.title,
        description: s.description || "",
        start_time: local,
        duration_min: s.duration_min || 60,
        provider: (s.provider as "zoom" | "manual") || "zoom",
        manual_join_url: s.join_url || "",
        passcode: s.zoom_password || s.passcode || "",
        create_zoom: false,
        recurrence: (s.recurrence as "none" | "daily" | "weekly" | "monthly") || "none",
        recurrence_until: toLocalInput(s.recurrence_until),
        lesson_id: s.lesson_id || "",
      });
    } else {
      setEditLive(null);
      const inHour = new Date(Date.now() + 60 * 60 * 1000);
      const local = new Date(inHour.getTime() - inHour.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setLiveForm({
        title: "",
        description: "",
        start_time: local,
        duration_min: 60,
        provider: "zoom",
        manual_join_url: "",
        passcode: "",
        create_zoom: true,
        recurrence: "none",
        recurrence_until: "",
        lesson_id: "",
      });
    }
    setLiveModal(true);
  };

  const livePayload = () => ({
    title: liveForm.title,
    description: liveForm.description,
    start_time: liveForm.start_time ? new Date(liveForm.start_time).toISOString() : null,
    end_time: null,
    duration_min: Number(liveForm.duration_min) || 60,
    provider: liveForm.provider,
    manual_join_url: liveForm.manual_join_url || null,
    passcode: liveForm.passcode || null,
    status: "scheduled",
    create_zoom: liveForm.create_zoom,
    recurrence: liveForm.recurrence,
    recurrence_until: liveForm.recurrence === "none" ? null : toIso(liveForm.recurrence_until),
    lesson_id: liveForm.lesson_id || null,
  });

  const lessonOptions = (programme?.subjects || []).flatMap((s) => s.lessons || []);

  const openClassList = async (s: LiveSession) => {
    setClassSession(s);
    setParticipants([]);
    setParticipantsLoading(true);
    try {
      const r = await api.get<{ session: LiveSession; participants: Participant[] }>(`/live-sessions/${s.id}/participants`);
      setParticipants(r.participants || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load class list");
    } finally {
      setParticipantsLoading(false);
    }
  };

  const toggleBlock = async (p: Participant) => {
    if (!classSession) return;
    await guard(async () => {
      await api.post(`/live-sessions/${classSession.id}/participants`, { user_id: p.user_id, blocked: !p.blocked });
      setParticipants((ps) => ps.map((x) => (x.user_id === p.user_id ? { ...x, blocked: !p.blocked } : x)));
    });
  };

  const refreshResources = async (target: ResTarget) => {
    const fresh = await api.get<Programme>(`/programmes/${id}`);
    setProgramme(fresh);
    setSettingsForm(fresh);
    const items =
      target.scope_type === "programme"
        ? fresh.materials || []
        : target.scope_type === "subject"
        ? fresh.subjects?.find((s) => s.id === target.scope_id)?.resources || []
        : fresh.subjects?.flatMap((s) => s.lessons || []).find((l) => l.id === target.scope_id)?.resources || [];
    setResTarget({ ...target, items });
  };

  const addResource = async () => {
    if (!resTarget || !programme || !resForm.title || !resForm.file_url) return;
    await guard(async () => {
      let subjectId: string | null = null;
      let lessonId: string | null = null;
      if (resTarget.scope_type === "subject") subjectId = resTarget.scope_id || null;
      if (resTarget.scope_type === "lesson") {
        lessonId = resTarget.scope_id || null;
        subjectId = (programme?.subjects || []).find((s) => (s.lessons || []).some((l) => l.id === lessonId))?.id || null;
      }
      await api.post(`/programmes/${programme.id}/materials`, {
        title: resForm.title,
        file_url: resForm.file_url,
        subject_id: subjectId,
        lesson_id: lessonId,
      });
      setResForm({ title: "", file_url: "" });
    });
    await refreshResources(resTarget);
  };

  const deleteResource = async (mid: string) => {
    if (!resTarget || !programme) return;
    if (!confirm("Delete this resource?")) return;
    await guard(() => api.delete(`/programmes/${programme.id}/materials/${mid}`));
    await refreshResources(resTarget);
  };

  const uploadResourceFile = async (file: File) => {
    setResUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("prefix", "resources");
      const r = await api.upload<{ url: string }>("/upload", fd);
      setResForm((f) => ({ ...f, file_url: r.url, title: f.title || file.name }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setResUploading(false);
    }
  };

  const openAssign = (a?: Assignment) => {
    if (a) {
      setEditAssign(a);
      const due = a.due_at ? new Date(a.due_at) : null;
      const local = due ? new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
      setAssignForm({
        title: a.title,
        description: a.description || "",
        subject_id: a.subject_id || "",
        due_at: local,
        max_marks: a.max_marks || 100,
        status: a.status || "published",
      });
    } else {
      setEditAssign(null);
      setAssignForm({ title: "", description: "", subject_id: "", due_at: "", max_marks: 100, status: "published" });
    }
    setAssignModal(true);
  };

  const assignPayload = () => ({
    title: assignForm.title,
    description: assignForm.description,
    subject_id: assignForm.subject_id,
    due_at: assignForm.due_at ? new Date(assignForm.due_at).toISOString() : null,
    max_marks: Number(assignForm.max_marks) || 100,
    status: assignForm.status,
  });

  const openSubs = async (a: Assignment) => {
    const list = await api.get<AssignmentSubmission[]>(`/assignments/${a.id}/submissions`);
    setSubs(list || []);
    setGradeSub(null);
    setOpenSubsFor(a);
  };

  if (loading) return <LoadingBlock />;
  if (!programme) return <Alert type="error">{error || "Not found"}</Alert>;

  const subjects = programme.subjects || [];
  const allLessons = subjects.flatMap((s) => s.lessons || []);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/programmes" className="inline-flex items-center gap-1.5 text-sm text-primary">
            <ArrowLeft className="h-4 w-4" /> Programmes
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-extrabold">{programme.title}</h1>
            <Badge status={programme.status} />
            <Badge>{programme.type}</Badge>
          </div>
          <p className="text-sm text-muted">/{programme.slug}</p>
        </div>
        <a href={`/programmes/${programme.slug}`} target="_blank" rel="noreferrer" className="btn-ghost">
          Preview
        </a>
      </div>

      {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {([
          ["curriculum", "Curriculum"],
          ["lessons", `Lessons (${allLessons.length})`],
          ["exams", `Exams (${exams.length})`],
          ["live", `Live Classes (${liveSessions.length})`],
          ["assignments", `Assignments (${assignments.length})`],
          ["settings", "Settings"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "curriculum" && (
        <div className="space-y-4">
          <Button onClick={() => setSubjModal(true)} disabled={busy}>
            <Plus className="h-4 w-4" /> Add Subject/Module
          </Button>
          {subjects.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">
                    <BookOpen className="mr-1.5 inline h-4 w-4 text-primary" />
                    {s.title} {s.is_free_preview && <Badge status="pending">Free preview</Badge>}
                    {programme.pricing_mode === "per_module" && (s.price ?? 0) > 0 && <Badge status="published">£{s.price}</Badge>}
                  </h3>
                  <p className="text-sm text-muted">{s.description}</p>
                  <p className="mt-1 text-xs text-muted">
                    {s.lessons?.length || 0} lessons
                    {(s.start_at || s.due_at) && (
                      <span className="ml-2">
                        · window: {s.start_at ? new Date(s.start_at).toLocaleDateString() : "…"} → {s.due_at ? new Date(s.due_at).toLocaleDateString() : "…"}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="soft"
                    onClick={() => {
                      setLessonForm({ ...lessonForm, subject_id: s.id });
                      setEditLesson(null);
                      setLessonModal(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Lesson
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setResTarget({ scope_type: "subject", scope_id: s.id, title: `Module — ${s.title}`, items: s.resources || [] })
                    }
                  >
                    <Paperclip className="h-4 w-4" /> Resources ({s.resources?.length || 0})
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      guard(async () => {
                        await api.put(`/programmes/${programme.id}/subjects/${s.id}`, {
                          title: s.title,
                          description: s.description,
                          sort_order: s.sort_order || 0,
                          is_free_preview: !s.is_free_preview,
                          start_at: s.start_at || null,
                          due_at: s.due_at || null,
                          price: s.price || 0,
                        });
                      })
                    }
                  >
                    Toggle preview
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => confirm("Delete subject and its lessons?") && guard(() => api.delete(`/programmes/${programme.id}/subjects/${s.id}`))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <ul className="mt-4 divide-y divide-border border-t border-border">
                {(s.lessons || []).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted" />
                      {l.title}
                      {l.is_free_preview && <Badge status="pending">Preview</Badge>}
                      {programme.pricing_mode === "per_lesson" && (l.price ?? 0) > 0 && <Badge status="published">£{l.price}</Badge>}
                    </span>
                    <div className="flex gap-2">
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() =>
                          setResTarget({ scope_type: "lesson", scope_id: l.id, title: `Lesson — ${l.title}`, items: l.resources || [] })
                        }
                      >
                        Resources ({l.resources?.length || 0})
                      </button>
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => {
                          setEditLesson(l);
                          setLessonForm({
                            title: l.title,
                            subject_id: s.id,
                            content: l.content || "",
                            video_url: l.video_url || "",
                            duration_min: l.duration_min || 10,
                            is_free_preview: !!l.is_free_preview,
                            available_at: toLocalInput(l.available_at),
                            due_at: toLocalInput(l.due_at),
                            price: l.price || 0,
                            with_live: false, live_start: "", live_duration: 60, live_provider: "zoom", live_join_url: "",
                          });
                          setLessonModal(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-xs text-danger hover:underline"
                        onClick={() => guard(() => api.delete(`/programmes/${programme.id}/lessons/${l.id}`))}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
                {(!s.lessons || s.lessons.length === 0) && (
                  <li className="py-3 text-sm text-muted">No lessons yet.</li>
                )}
              </ul>
            </Card>
          ))}
          {subjects.length === 0 && <Emptyish label="No subjects yet — add your first module." />}
        </div>
      )}

      {tab === "lessons" && (
        <div>
          {subjects.length === 0 ? (
            <Emptyish label="Add a subject first from the Curriculum tab." />
          ) : (
            <Table headers={["Lesson", "Subject", "Duration", "Preview", "Status", "Actions"]}>
              {allLessons.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-medium">{l.title}</td>
                  <td className="px-4 py-3 text-muted">
                    {subjects.find((s) => (s.lessons || []).some((x) => x.id === l.id))?.title || "—"}
                  </td>
                  <td className="px-4 py-3">{l.duration_min} min</td>
                  <td className="px-4 py-3">{l.is_free_preview ? "Yes" : "No"}</td>
                  <td className="px-4 py-3"><Badge status={l.status || "published"} /></td>
                  <td className="px-4 py-3">
                    <button
                      className="text-xs text-danger hover:underline"
                      onClick={() => guard(() => api.delete(`/programmes/${programme.id}/lessons/${l.id}`))}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {tab === "exams" && (
        <div>
          <Button className="mb-4" onClick={() => setExamModal(true)}>
            <Plus className="h-4 w-4" /> New Exam
          </Button>
          <Table headers={["Exam", "Type", "Mode", "Duration", "Pass", "Attempts", "Status", "Actions"]}>
            {exams.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-medium">{e.title}</td>
                <td className="px-4 py-3 capitalize">{e.type}</td>
                <td className="px-4 py-3 capitalize">{e.submission_mode || "online"}</td>
                <td className="px-4 py-3">{e.duration_min} min</td>
                <td className="px-4 py-3">{e.pass_marks}</td>
                <td className="px-4 py-3">{e.max_attempts}</td>
                <td className="px-4 py-3"><Badge status={e.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => openQuestions(e)}>
                      <GraduationCap className="h-3.5 w-3.5" /> Questions
                    </button>
                    <button
                      className="btn-ghost px-3 py-1.5 text-xs"
                      onClick={() =>
                        guard(async () => {
                          await api.put(`/exams/${e.id}`, { ...e, status: e.status === "published" ? "draft" : "published" } as never);
                        })
                      }
                    >
                      {e.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      className="btn-danger px-3 py-1.5 text-xs"
                      onClick={() => confirm("Delete exam?") && guard(() => api.delete(`/exams/${e.id}`))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {exams.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted">No exams yet.</td>
              </tr>
            )}
          </Table>
        </div>
      )}

      {tab === "live" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Live classes are visible only to students enrolled in this programme. Create a Zoom meeting automatically or paste a manual join link.
            </p>
            <Button onClick={() => openLive()}>
              <Plus className="h-4 w-4" /> New Live Class
            </Button>
          </div>
          <Table headers={["Title", "Lesson", "When", "Provider", "Status", "Actions"]}>
            {liveSessions.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium">
                  <Video className="mr-1.5 inline h-4 w-4 text-primary" />
                  {s.title}
                  {s.recurrence && s.recurrence !== "none" && (
                    <span className="ml-2 text-xs font-normal text-muted">#{(s.occurrence_index ?? 0) + 1}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-muted">
                  {lessonOptions.find((l) => l.id === s.lesson_id)?.title || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-muted">
                  {s.start_time ? new Date(s.start_time).toLocaleString() : "—"}
                  {s.duration_min ? ` · ${s.duration_min}m` : ""}
                  {s.recurrence && s.recurrence !== "none" && (
                    <span className="ml-1.5 text-xs">· {recurrenceLabel(s.recurrence)}</span>
                  )}
                </td>
                <td className="px-4 py-3 capitalize">{s.provider || "zoom"}</td>
                <td className="px-4 py-3"><Badge status={s.status || "scheduled"} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => openClassList(s)}>
                      <Users className="mr-1 inline h-3.5 w-3.5" /> Class list
                    </button>
                    {s.join_url && (
                      <a className="btn-ghost px-3 py-1.5 text-xs" href={s.join_url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    )}
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => openLive(s)}>
                      Edit
                    </button>
                    <button
                      className="btn-danger px-3 py-1.5 text-xs"
                      onClick={() =>
                        confirm(
                          s.recurrence && s.recurrence !== "none"
                            ? "Delete upcoming sessions in this series? Past sessions are kept as history."
                            : "Delete live session?"
                        ) && guard(() => api.delete(`/live-sessions/${s.id}`))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {liveSessions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">No live classes yet.</td>
              </tr>
            )}
          </Table>
        </div>
      )}

      {tab === "assignments" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Assignments count toward the final grade using the weights set in Settings (assignment % + exam %).
            </p>
            <Button onClick={() => openAssign()} disabled={busy}>
              <Plus className="h-4 w-4" /> New Assignment
            </Button>
          </div>
          <Table headers={["Title", "Module", "Due", "Max Marks", "Status", "Actions"]}>
            {assignments.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium">
                  <FileText className="mr-1.5 inline h-4 w-4 text-primary" />
                  {a.title}
                </td>
                <td className="px-4 py-3 text-sm text-muted">{a.subject?.title || "—"}</td>
                <td className="px-4 py-3 text-sm text-muted">{a.due_at ? new Date(a.due_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">{a.max_marks}</td>
                <td className="px-4 py-3"><Badge status={a.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => openSubs(a)}>
                      Submissions ({a.submission_count ?? 0})
                    </button>
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => openAssign(a)}>
                      Edit
                    </button>
                    <button
                      className="btn-danger px-3 py-1.5 text-xs"
                      onClick={() => confirm("Delete assignment and its submissions?") && guard(() => api.delete(`/assignments/${a.id}`))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">No assignments yet.</td>
              </tr>
            )}
          </Table>
        </div>
      )}

      {tab === "settings" && (
        <Card className="max-w-2xl p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title">
              <Input value={settingsForm.title || ""} onChange={(e) => setSettingsForm({ ...settingsForm, title: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={settingsForm.status || "draft"} onChange={(e) => setSettingsForm({ ...settingsForm, status: e.target.value })}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
            <Field label="Price" hint={settingsForm.pricing_mode === "subscription" ? "Price per billing cycle" : settingsForm.pricing_mode === "per_lesson" || settingsForm.pricing_mode === "per_module" ? "Programme price (per-scope prices set on modules/lessons)" : "Full programme price"}>
              <Input type="number" value={settingsForm.price ?? 0} onChange={(e) => setSettingsForm({ ...settingsForm, price: Number(e.target.value) })} />
            </Field>
            <Field label="Currency" hint="Currency for this course's prices">
              <Select
                value={settingsForm.currency || "USD"}
                onChange={(e) => setSettingsForm({ ...settingsForm, currency: e.target.value })}
              >
                {currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Pricing mode">
              <Select
                value={settingsForm.pricing_mode || "once"}
                onChange={(e) => setSettingsForm({ ...settingsForm, pricing_mode: e.target.value as Programme["pricing_mode"] })}
              >
                <option value="once">One-time (lifetime access)</option>
                <option value="subscription">Time-limited access</option>
                <option value="per_module">Per module</option>
                <option value="per_lesson">Per lesson</option>
              </Select>
            </Field>
            {settingsForm.pricing_mode === "subscription" && (
              <Field label="Billing interval" hint="Access expires after each paid period">
                <Select
                  value={settingsForm.billing_interval || "monthly"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, billing_interval: e.target.value as Programme["billing_interval"] })}
                >
                  <option value="weekly">Weekly (7 days)</option>
                  <option value="monthly">Monthly (30 days)</option>
                  <option value="semester">Semester (4 months)</option>
                  <option value="yearly">Yearly (12 months)</option>
                </Select>
              </Field>
            )}
            <Field label="Category">
              <Input value={settingsForm.category || ""} onChange={(e) => setSettingsForm({ ...settingsForm, category: e.target.value })} />
            </Field>
            <Field label="Level">
              <Input value={settingsForm.level || ""} onChange={(e) => setSettingsForm({ ...settingsForm, level: e.target.value })} />
            </Field>
            <Field label="Duration">
              <Input value={settingsForm.duration || ""} onChange={(e) => setSettingsForm({ ...settingsForm, duration: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Intro video (public)"
                hint="Shown to everyone on the programme page — viewable without login or payment. Paste a YouTube URL or upload a video file (max 50MB)."
              >
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-[240px] flex-1"
                    placeholder="https://www.youtube.com/watch?v=... or uploaded file URL"
                    value={settingsForm.intro_video_url || ""}
                    onChange={(e) => setSettingsForm({ ...settingsForm, intro_video_url: e.target.value })}
                  />
                  <label className={`btn-ghost cursor-pointer ${introUploading ? "pointer-events-none opacity-60" : ""}`}>
                    <Upload className="h-4 w-4" /> {introUploading ? "Uploading…" : "Upload video"}
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadIntro(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {settingsForm.intro_video_url && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setSettingsForm({ ...settingsForm, intro_video_url: null })}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </Field>
              {settingsForm.intro_video_url && (
                <p className="mt-1 text-xs text-muted">
                  Current:{" "}
                  <a className="text-primary hover:underline" href={settingsForm.intro_video_url} target="_blank" rel="noreferrer">
                    {settingsForm.intro_video_url}
                  </a>
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!settingsForm.final_exam_required}
                onChange={(e) => setSettingsForm({ ...settingsForm, final_exam_required: e.target.checked })}
              />
              Final exam required for certificate
            </label>
            <Field label="Assignment weight (%)" hint="e.g. 40 — leave 0 for exam-only grading">
              <Input
                type="number"
                min={0}
                max={100}
                value={settingsForm.assignment_weight ?? 40}
                onChange={(e) => setSettingsForm({ ...settingsForm, assignment_weight: Number(e.target.value) })}
              />
            </Field>
            <Field label="Exam weight (%)" hint="Weights are normalized so they sum to 100">
              <Input
                type="number"
                min={0}
                max={100}
                value={settingsForm.exam_weight ?? 60}
                onChange={(e) => setSettingsForm({ ...settingsForm, exam_weight: Number(e.target.value) })}
              />
            </Field>
            <Field label="Pass mark (%)" hint="Minimum weighted final grade to pass">
              <Input
                type="number"
                min={0}
                max={100}
                value={settingsForm.pass_percent ?? 50}
                onChange={(e) => setSettingsForm({ ...settingsForm, pass_percent: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Summary">
              <Textarea value={settingsForm.summary || ""} onChange={(e) => setSettingsForm({ ...settingsForm, summary: e.target.value })} />
            </Field>
            <Field label="Description">
              <Textarea rows={6} value={settingsForm.description || ""} onChange={(e) => setSettingsForm({ ...settingsForm, description: e.target.value })} />
            </Field>
          </div>
          <Button
            className="mt-5"
            loading={busy}
            onClick={() =>
              guard(async () => {
                await api.put(`/programmes/${programme.id}`, {
                  type: programme.type,
                  title: settingsForm.title,
                  slug: programme.slug,
                  summary: settingsForm.summary || "",
                  description: settingsForm.description || "",
                  cover_image_url: programme.cover_image_url,
                  intro_video_url: settingsForm.intro_video_url || null,
                  category: settingsForm.category,
                  level: settingsForm.level,
                  duration: settingsForm.duration,
      price: settingsForm.price || 0,
      currency: settingsForm.currency || programme.currency || "USD",
                  is_free: (settingsForm.price ?? programme.price) === 0,
                  pricing_mode: settingsForm.pricing_mode || "once",
                  billing_interval: settingsForm.pricing_mode === "subscription" ? settingsForm.billing_interval || "monthly" : null,
                  status: settingsForm.status,
                  instructor_ids: programme.instructors?.map((i) => i.id) || [],
                  prerequisites: programme.prerequisites || [],
                  learn_outcomes: programme.learn_outcomes || [],
                  sort_order: 0,
                  final_exam_required: !!settingsForm.final_exam_required,
                  assignment_weight: Number(settingsForm.assignment_weight ?? 40),
                  exam_weight: Number(settingsForm.exam_weight ?? 60),
                  pass_percent: Number(settingsForm.pass_percent ?? 50),
                });
              })
            }
          >
            <Save className="h-4 w-4" /> Save settings
          </Button>
          <div className="mt-4 border-t border-border pt-4">
            <Button
              variant="ghost"
              onClick={() => setResTarget({ scope_type: "programme", title: "Course", items: programme.materials || [] })}
            >
              <Paperclip className="h-4 w-4" /> Course resources ({programme.materials?.length || 0})
            </Button>
          </div>
        </Card>
      )}

      {/* Subject modal */}
      <Modal open={subjModal} onClose={() => setSubjModal(false)} title="Add Subject / Module">
        <div className="space-y-4">
          <Field label="Title">
            <Input value={subjForm.title} onChange={(e) => setSubjForm({ ...subjForm, title: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea value={subjForm.description} onChange={(e) => setSubjForm({ ...subjForm, description: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Opens at (optional — module window starts)">
              <Input type="datetime-local" value={subjForm.start_at} onChange={(e) => setSubjForm({ ...subjForm, start_at: e.target.value })} />
            </Field>
            <Field label="Due at (optional — module window ends)">
              <Input type="datetime-local" value={subjForm.due_at} onChange={(e) => setSubjForm({ ...subjForm, due_at: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Leave empty for no lock. Lesson dates override this window. Times are local; stored as UTC.
          </p>
          <Field label="Module price" hint="Used when the programme pricing mode is Per module">
            <Input type="number" min={0} value={subjForm.price} onChange={(e) => setSubjForm({ ...subjForm, price: Number(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={subjForm.is_free_preview} onChange={(e) => setSubjForm({ ...subjForm, is_free_preview: e.target.checked })} />
            Free preview
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setSubjModal(false)}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!subjForm.title}
            onClick={async () => {
              await guard(() =>
                api.post(`/programmes/${programme.id}/subjects`, {
                  title: subjForm.title,
                  description: subjForm.description,
                  is_free_preview: subjForm.is_free_preview,
                  sort_order: 0,
                  start_at: toIso(subjForm.start_at),
                  due_at: toIso(subjForm.due_at),
                  price: Number(subjForm.price) || 0,
                })
              );
              setSubjModal(false);
              setSubjForm({ title: "", description: "", is_free_preview: false, start_at: "", due_at: "", price: 0 });
            }}
          >
            Add
          </Button>
        </div>
      </Modal>

      {/* Lesson modal */}
      <Modal open={lessonModal} onClose={() => setLessonModal(false)} title={editLesson ? "Edit Lesson" : "Add Lesson"} wide>
        <div className="space-y-4">
          <Field label="Subject">
            <Select value={lessonForm.subject_id} onChange={(e) => setLessonForm({ ...lessonForm, subject_id: e.target.value })}>
              <option value="">Select subject...</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Title">
            <Input value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} />
          </Field>
          <Field label="Video URL (YouTube or direct)">
            <Input value={lessonForm.video_url} onChange={(e) => setLessonForm({ ...lessonForm, video_url: e.target.value })} />
          </Field>
          <Field label="Duration (minutes)">
            <Input type="number" value={lessonForm.duration_min} onChange={(e) => setLessonForm({ ...lessonForm, duration_min: Number(e.target.value) })} />
          </Field>
          <Field label="Content (HTML/markdown text)">
            <Textarea rows={8} value={lessonForm.content} onChange={(e) => setLessonForm({ ...lessonForm, content: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Available from (optional — lock before this)">
              <Input type="datetime-local" value={lessonForm.available_at} onChange={(e) => setLessonForm({ ...lessonForm, available_at: e.target.value })} />
            </Field>
            <Field label="Due at (optional — overdue after this)">
              <Input type="datetime-local" value={lessonForm.due_at} onChange={(e) => setLessonForm({ ...lessonForm, due_at: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-muted">Overrides the module window for this lesson. Leave empty to inherit.</p>
          <Field label="Lesson price" hint="Used when the programme pricing mode is Per lesson">
            <Input type="number" min={0} value={lessonForm.price} onChange={(e) => setLessonForm({ ...lessonForm, price: Number(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lessonForm.is_free_preview} onChange={(e) => setLessonForm({ ...lessonForm, is_free_preview: e.target.checked })} />
            Free preview
          </label>
          {!editLesson && (
            <div className="rounded-lg border border-border bg-canvas p-4">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={lessonForm.with_live}
                  onChange={(e) => setLessonForm({ ...lessonForm, with_live: e.target.checked })}
                />
                <Video className="h-4 w-4 text-primary" /> Schedule a live class for this lesson (optional)
              </label>
              {lessonForm.with_live && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Starts at">
                    <Input type="datetime-local" value={lessonForm.live_start} onChange={(e) => setLessonForm({ ...lessonForm, live_start: e.target.value })} />
                  </Field>
                  <Field label="Duration (minutes)">
                    <Input type="number" min={5} value={lessonForm.live_duration} onChange={(e) => setLessonForm({ ...lessonForm, live_duration: Number(e.target.value) })} />
                  </Field>
                  <Field label="Provider">
                    <Select value={lessonForm.live_provider} onChange={(e) => setLessonForm({ ...lessonForm, live_provider: e.target.value as "zoom" | "manual" })}>
                      <option value="zoom">Zoom (auto-created)</option>
                      <option value="manual">Manual (paste join URL)</option>
                    </Select>
                  </Field>
                  {lessonForm.live_provider === "manual" && (
                    <Field label="Join URL">
                      <Input value={lessonForm.live_join_url} onChange={(e) => setLessonForm({ ...lessonForm, live_join_url: e.target.value })} />
                    </Field>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setLessonModal(false)}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!lessonForm.title || !lessonForm.subject_id || (lessonForm.with_live && !lessonForm.live_start)}
            onClick={async () => {
              let createdId = "";
              await guard(async () => {
                if (editLesson) {
                  await api.put(`/programmes/${programme.id}/lessons/${editLesson.id}`, {
                    title: lessonForm.title,
                    content: lessonForm.content,
                    video_url: lessonForm.video_url || null,
                    duration_min: lessonForm.duration_min,
                    sort_order: 0,
                    is_free_preview: lessonForm.is_free_preview,
                    status: "published",
                    available_at: toIso(lessonForm.available_at),
                    due_at: toIso(lessonForm.due_at),
                    price: Number(lessonForm.price) || 0,
                  });
                } else {
                  const created = await api.post<{ id: string }>(`/programmes/${programme.id}/lessons?subject_id=${lessonForm.subject_id}`, {
                    title: lessonForm.title,
                    content: lessonForm.content,
                    video_url: lessonForm.video_url || null,
                    duration_min: lessonForm.duration_min,
                    sort_order: 0,
                    is_free_preview: lessonForm.is_free_preview,
                    status: "published",
                    available_at: toIso(lessonForm.available_at),
                    due_at: toIso(lessonForm.due_at),
                    price: Number(lessonForm.price) || 0,
                  });
                  createdId = created.id;
                }
              });
              if (!editLesson && createdId && lessonForm.with_live && lessonForm.live_start) {
                await guard(() =>
                  api.post(`/programmes/${programme.id}/live-sessions`, {
                    title: `Live: ${lessonForm.title}`,
                    description: "",
                    start_time: new Date(lessonForm.live_start).toISOString(),
                    end_time: null,
                    duration_min: Number(lessonForm.live_duration) || 60,
                    provider: lessonForm.live_provider,
                    manual_join_url: lessonForm.live_provider === "manual" ? lessonForm.live_join_url || null : null,
                    passcode: null,
                    status: "scheduled",
                    create_zoom: lessonForm.live_provider === "zoom",
                    recurrence: "none",
                    recurrence_until: null,
                    lesson_id: createdId,
                  })
                );
              }
              setLessonModal(false);
              setEditLesson(null);
              setLessonForm({
                title: "", subject_id: "", content: "", video_url: "", duration_min: 10, is_free_preview: false,
                available_at: "", due_at: "", price: 0,
                with_live: false, live_start: "", live_duration: 60, live_provider: "zoom", live_join_url: "",
              });
            }}
          >
            Save
          </Button>
        </div>
      </Modal>

      {/* Exam modal */}
      <Modal open={examModal} onClose={() => setExamModal(false)} title="New Exam">
        <div className="space-y-4">
          <Field label="Title">
            <Input value={examForm.title} onChange={(e) => setExamForm({ ...examForm, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select value={examForm.type} onChange={(e) => setExamForm({ ...examForm, type: e.target.value })}>
                <option value="quiz">Quiz</option>
                <option value="midterm">Midterm</option>
                <option value="final">Final</option>
              </Select>
            </Field>
            <Field label="Duration (min)">
              <Input type="number" value={examForm.duration_min} onChange={(e) => setExamForm({ ...examForm, duration_min: Number(e.target.value) })} />
            </Field>
            <Field label="Pass marks">
              <Input type="number" value={examForm.pass_marks} onChange={(e) => setExamForm({ ...examForm, pass_marks: Number(e.target.value) })} />
            </Field>
            <Field label="Max attempts">
              <Input type="number" value={examForm.max_attempts} onChange={(e) => setExamForm({ ...examForm, max_attempts: Number(e.target.value) })} />
            </Field>
            <Field label="Submission mode">
              <Select value={examForm.submission_mode} onChange={(e) => setExamForm({ ...examForm, submission_mode: e.target.value as "online" | "file" | "both" })}>
                <option value="online">Online (type answers in browser)</option>
                <option value="file">Answer paper upload only</option>
                <option value="both">Both online + answer paper</option>
              </Select>
            </Field>
            <Field label="Total marks (manual grading)">
              <Input type="number" min={0} value={examForm.total_marks} onChange={(e) => setExamForm({ ...examForm, total_marks: Number(e.target.value) })} />
            </Field>
          </div>
          {examForm.submission_mode !== "online" && (
            <Field label="Question paper (PDF — students download)">
              <div className="flex items-center gap-3">
                <label className={`btn-ghost ${paperUploading ? "pointer-events-none opacity-60" : ""}`}>
                  {paperUploading ? "Uploading…" : examForm.paper_file_url ? "Replace paper" : "Upload paper"}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setPaperUploading(true);
                      try {
                        const fd = new FormData();
                        fd.append("file", f);
                        const res = await api.upload<{ url: string }>("/upload", fd);
                        setExamForm((prev) => ({ ...prev, paper_file_url: res.url }));
                      } finally {
                        setPaperUploading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
                {examForm.paper_file_url && (
                  <a className="text-xs text-primary hover:underline" href={examForm.paper_file_url} target="_blank" rel="noreferrer">
                    View current paper
                  </a>
                )}
              </div>
            </Field>
          )}
          <p className="text-xs text-muted">
            For paper modes students download the paper and upload a photo/PDF of their answers after submitting.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setExamModal(false)}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!examForm.title}
            onClick={async () => {
              await guard(() =>
                api.post(`/programmes/${programme.id}/exams`, {
                  ...examForm,
                  paper_file_url: examForm.paper_file_url || null,
                  shuffle: true,
                })
              );
              setExamModal(false);
              setExamForm({ title: "", type: "quiz", duration_min: 30, pass_marks: 0, max_attempts: 1, status: "draft", description: "", submission_mode: "online", paper_file_url: "", total_marks: 0 });
            }}
          >
            Create
          </Button>
        </div>
      </Modal>

      {/* Live class modal */}
      <Modal open={liveModal} onClose={() => setLiveModal(false)} title={editLive ? "Edit Live Class" : "New Live Class"} wide>
        <div className="space-y-4">
          <Field label="Title">
            <Input value={liveForm.title} onChange={(e) => setLiveForm({ ...liveForm, title: e.target.value })} />
          </Field>
          <Field label="Related lesson (optional)" hint="Students who have not purchased this lesson cannot join. Leave empty for programme-wide access.">
            <Select value={liveForm.lesson_id} onChange={(e) => setLiveForm({ ...liveForm, lesson_id: e.target.value })}>
              <option value="">None (programme-wide)</option>
              {(programme?.subjects || []).map((s) => (
                <optgroup key={s.id} label={s.title}>
                  {(s.lessons || []).map((l) => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start time">
              <Input type="datetime-local" value={liveForm.start_time} onChange={(e) => setLiveForm({ ...liveForm, start_time: e.target.value })} />
            </Field>
            <Field label="Duration (minutes)">
              <Input type="number" min={15} value={liveForm.duration_min} onChange={(e) => setLiveForm({ ...liveForm, duration_min: Number(e.target.value) })} />
            </Field>
            <Field label="Repeat">
              <Select
                value={liveForm.recurrence}
                onChange={(e) => setLiveForm({ ...liveForm, recurrence: e.target.value as "none" | "daily" | "weekly" | "monthly" })}
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </Field>
            {liveForm.recurrence !== "none" && (
              <Field label="Repeat until (inclusive)">
                <Input
                  type="datetime-local"
                  value={liveForm.recurrence_until}
                  onChange={(e) => setLiveForm({ ...liveForm, recurrence_until: e.target.value })}
                />
              </Field>
            )}
          </div>
          {liveForm.recurrence !== "none" && (
            <p className="text-xs text-muted">
              Sessions are created in one batch (max 60). On edit/delete only upcoming occurrences change — past ones stay as history.
              Editing a series shares one Zoom meeting.
            </p>
          )}
          <Field label="Provider">
            <Select value={liveForm.provider} onChange={(e) => setLiveForm({ ...liveForm, provider: e.target.value as "zoom" | "manual" })}>
              <option value="zoom">Zoom (auto-create meeting)</option>
              <option value="manual">Manual link (paste Zoom/Meet URL)</option>
            </Select>
          </Field>
          {liveForm.provider === "manual" && (
            <Field label="Join URL">
              <Input
                placeholder="https://zoom.us/j/..."
                value={liveForm.manual_join_url}
                onChange={(e) => setLiveForm({ ...liveForm, manual_join_url: e.target.value })}
              />
            </Field>
          )}
          {liveForm.provider === "manual" && (
            <Field label="Passcode (optional)">
              <Input value={liveForm.passcode} onChange={(e) => setLiveForm({ ...liveForm, passcode: e.target.value })} />
            </Field>
          )}
          {liveForm.provider === "zoom" && !editLive && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={liveForm.create_zoom}
                onChange={(e) => setLiveForm({ ...liveForm, create_zoom: e.target.checked })}
              />
              Create Zoom meeting now (requires ZOOM_* env vars)
            </label>
          )}
          <Field label="Description">
            <Textarea value={liveForm.description} onChange={(e) => setLiveForm({ ...liveForm, description: e.target.value })} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setLiveModal(false)}>Cancel</Button>
          <Button
            loading={busy}
            disabled={
              !liveForm.title ||
              (liveForm.provider === "manual" && !liveForm.manual_join_url && !editLive) ||
              (liveForm.recurrence !== "none" && !liveForm.recurrence_until)
            }
            onClick={async () => {
              if (liveForm.recurrence !== "none" && liveForm.recurrence_until && liveForm.start_time && new Date(liveForm.recurrence_until) <= new Date(liveForm.start_time)) {
                alert("Repeat-until must be after the start time.");
                return;
              }
              await guard(() =>
                editLive
                  ? api.put(`/live-sessions/${editLive.id}`, livePayload())
                  : api.post(`/programmes/${programme.id}/live-sessions`, livePayload())
              );
              setLiveModal(false);
              setEditLive(null);
            }}
          >
            Save
          </Button>
        </div>
      </Modal>

      {/* Questions modal */}
      <Modal open={qModal} onClose={() => setQModal(false)} title={`Questions — ${examForQuestions?.title || ""}`} wide>
        <div className="mb-4 rounded-xl bg-surface2 p-3 text-sm text-muted">
          Add questions below. Objective types (MCQ, true/false, fill blank, ordering, matching) are auto-graded.
          Essay & short answer go to the grading queue.
        </div>
        <Table headers={["Type", "Question", "Marks", ""]}>
          {questions.map((q) => (
            <tr key={q.id}>
              <td className="px-3 py-2"><Badge>{q.type}</Badge></td>
              <td className="px-3 py-2 line-clamp-2">{q.statement}</td>
              <td className="px-3 py-2">{q.marks}</td>
              <td className="px-3 py-2">
                <button className="text-xs text-danger hover:underline" onClick={() => guard(() => api.delete(`/questions/${q.id}`))}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {questions.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-center text-muted">No questions yet.</td>
            </tr>
          )}
        </Table>

        <div className="mt-5 rounded-xl border border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Question type">
              <Select value={qForm.type} onChange={(e) => setQForm({ ...qForm, type: e.target.value, correct_answer: "" })}>
                <option value="mcq">MCQ</option>
                <option value="true_false">True / False</option>
                <option value="fill_blank">Fill in the blank</option>
                <option value="short_answer">Short answer (manual)</option>
                <option value="essay">Essay (manual)</option>
                <option value="ordering">Ordering</option>
              </Select>
            </Field>
            <Field label="Marks">
              <Input type="number" min={1} value={qForm.marks} onChange={(e) => setQForm({ ...qForm, marks: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Statement">
              <Textarea value={qForm.statement} onChange={(e) => setQForm({ ...qForm, statement: e.target.value })} />
            </Field>
          </div>

          {qForm.type === "mcq" && (
            <div className="mt-3 space-y-2">
              <label className="label">Options (select the correct one)</label>
              {qForm.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    checked={qForm.correct_answer === opt && opt !== ""}
                    onChange={() => setQForm({ ...qForm, correct_answer: opt })}
                    disabled={opt === ""}
                  />
                  <Input
                    value={opt}
                    placeholder={`Option ${i + 1}`}
                    onChange={(e) => {
                      const options = [...qForm.options];
                      const old = options[i];
                      options[i] = e.target.value;
                      if (qForm.correct_answer === old) qForm.correct_answer = e.target.value;
                      setQForm({ ...qForm, options });
                    }}
                  />
                  <button
                    className="text-danger"
                    onClick={() => setQForm({ ...qForm, options: qForm.options.filter((_, x) => x !== i) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button variant="ghost" onClick={() => setQForm({ ...qForm, options: [...qForm.options, ""] })}>
                <Plus className="h-4 w-4" /> Add option
              </Button>
            </div>
          )}

          {qForm.type === "true_false" && (
            <div className="mt-3">
              <label className="label">Correct answer</label>
              <Select value={String(qForm.correct_answer)} onChange={(e) => setQForm({ ...qForm, correct_answer: e.target.value })}>
                <option value="true">True</option>
                <option value="false">False</option>
              </Select>
            </div>
          )}

          {(qForm.type === "fill_blank" || qForm.type === "short_answer") && (
            <div className="mt-3">
              <label className="label">{qForm.type === "fill_blank" ? "Accepted answer(s), comma-separated" : "Model answer (reference)"}</label>
              <Input
                value={String(qForm.correct_answer || "")}
                onChange={(e) => setQForm({ ...qForm, correct_answer: e.target.value })}
              />
            </div>
          )}

          {qForm.type === "essay" && (
            <p className="mt-3 text-sm text-muted">Students write free text — grade it from the Grading Queue.</p>
          )}

          {qForm.type === "ordering" && (
            <div className="mt-3">
              <label className="label">Correct order (comma-separated)</label>
              <Input
                value={String(qForm.correct_answer || "")}
                onChange={(e) =>
                  setQForm({ ...qForm, correct_answer: e.target.value.split(",").map((s) => s.trim()) })
                }
                placeholder="first, second, third"
              />
            </div>
          )}

          <Button
            className="mt-4"
            loading={busy}
            disabled={!qForm.statement}
            onClick={async () => {
              if (!examForQuestions) return;
              let correct: unknown = qForm.correct_answer;
              if (qForm.type === "fill_blank") {
                correct = String(qForm.correct_answer || "").split(",").map((s) => s.trim());
              }
              await guard(() =>
                api.post(`/exams/${examForQuestions.id}/questions`, {
                  type: qForm.type,
                  statement: qForm.statement,
                  options: qForm.type === "mcq" ? qForm.options.filter((o) => o) : [],
                  correct_answer: qForm.type === "mcq" ? qForm.correct_answer : correct,
                  accepted_answers: qForm.type === "fill_blank" ? (correct as string[]) : [],
                  marks: qForm.marks,
                  explanation: "",
                  sort_order: questions.length,
                })
              );
              const full = await api.get<Exam>(`/exams/${examForQuestions.id}`);
              setQuestions(full.questions || []);
              setQForm({ type: "mcq", statement: "", options: ["", ""], correct_answer: "", marks: 1 });
            }}
          >
            Add question
          </Button>
        </div>
      </Modal>

      {/* Assignment modal */}
      <Modal
        open={assignModal}
        onClose={() => { setAssignModal(false); setEditAssign(null); }}
        title={editAssign ? "Edit Assignment" : "New Assignment"}
        wide
      >
        <div className="space-y-4">
          <Field label="Title">
            <Input value={assignForm.title} onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Module / Subject">
              <Select value={assignForm.subject_id} onChange={(e) => setAssignForm({ ...assignForm, subject_id: e.target.value })}>
                <option value="">— No module —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </Select>
            </Field>
            <Field label="Max marks">
              <Input type="number" min={1} value={assignForm.max_marks} onChange={(e) => setAssignForm({ ...assignForm, max_marks: Number(e.target.value) })} />
            </Field>
            <Field label="Due date">
              <Input type="datetime-local" value={assignForm.due_at} onChange={(e) => setAssignForm({ ...assignForm, due_at: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={assignForm.status} onChange={(e) => setAssignForm({ ...assignForm, status: e.target.value })}>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </Select>
            </Field>
          </div>
          <Field label="Instructions">
            <Textarea value={assignForm.description} onChange={(e) => setAssignForm({ ...assignForm, description: e.target.value })} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { setAssignModal(false); setEditAssign(null); }}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!assignForm.title}
            onClick={async () => {
              await guard(() =>
                editAssign
                  ? api.put(`/assignments/${editAssign.id}`, assignPayload())
                  : api.post(`/programmes/${programme.id}/assignments`, assignPayload())
              );
              setAssignModal(false);
              setEditAssign(null);
            }}
          >
            Save
          </Button>
        </div>
      </Modal>

      {/* Submissions + grading modal */}
      <Modal
        open={!!openSubsFor}
        onClose={() => { setOpenSubsFor(null); setGradeSub(null); }}
        title={`Submissions — ${openSubsFor?.title || ""}`}
        wide
      >
        <Table headers={["Student", "Submitted", "Score", "Status", "Actions"]}>
          {subs.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3">
                <p className="font-medium">{s.student?.name || "Student"}</p>
                <p className="text-xs text-muted">{s.student?.email}</p>
              </td>
              <td className="px-4 py-3 text-sm text-muted">
                {s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-3">{s.score != null ? `${s.score}/${s.max_marks}` : "—"}</td>
              <td className="px-4 py-3"><Badge status={s.status} /></td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  {s.text && (
                    <button
                      className="btn-ghost px-3 py-1.5 text-xs"
                      onClick={() => alert(s.text || "")}
                    >
                      View
                    </button>
                  )}
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => {
                      setGradeSub(s);
                      setGradeForm({ score: s.score ?? 0, feedback: s.feedback || "" });
                    }}
                  >
                    Grade
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {subs.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-muted">No submissions yet.</td>
            </tr>
          )}
        </Table>

        {gradeSub && (
          <div className="mt-5 rounded-xl border border-border bg-surface2 p-4">
            <h4 className="mb-3 font-bold">Grade {gradeSub.student?.name || "submission"}</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Score (0–${gradeSub.max_marks})`}>
                <Input
                  type="number"
                  min={0}
                  max={gradeSub.max_marks}
                  value={gradeForm.score}
                  onChange={(e) => setGradeForm({ ...gradeForm, score: Number(e.target.value) })}
                />
              </Field>
              <Field label="Feedback">
                <Textarea value={gradeForm.feedback} onChange={(e) => setGradeForm({ ...gradeForm, feedback: e.target.value })} />
              </Field>
            </div>
            <Button
              className="mt-4"
              loading={busy}
              onClick={async () => {
                const updated = await api.post<AssignmentSubmission>(`/submissions/${gradeSub.id}/grade`, {
                  score: gradeForm.score,
                  feedback: gradeForm.feedback,
                });
                setSubs((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                setGradeSub(null);
                await load();
              }}
            >
              Save grade
            </Button>
          </div>
        )}
      </Modal>

      {/* Resources modal */}
      {resTarget && (
        <Modal open onClose={() => setResTarget(null)} title={`Resources — ${resTarget.title}`} wide>
          <div className="space-y-4">
            {resTarget.items.length === 0 && <p className="text-sm text-muted">No resources yet.</p>}
            <ul className="divide-y divide-border rounded-lg border border-border">
              {resTarget.items.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <a className="inline-flex items-center gap-2 text-primary hover:underline" href={m.file_url} target="_blank" rel="noreferrer">
                    <Paperclip className="h-4 w-4 shrink-0" /> {m.title}
                  </a>
                  <button className="shrink-0 text-xs text-danger hover:underline" onClick={() => deleteResource(m.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            <div className="rounded-lg border border-border bg-canvas p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title">
                  <Input value={resForm.title} onChange={(e) => setResForm({ ...resForm, title: e.target.value })} />
                </Field>
                <Field label="Upload a file">
                  <input
                    type="file"
                    className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadResourceFile(f);
                    }}
                  />
                </Field>
              </div>
              <Field label="File URL">
                <Input
                  placeholder="https://... (paste a URL or upload a file above)"
                  value={resForm.file_url}
                  onChange={(e) => setResForm({ ...resForm, file_url: e.target.value })}
                />
              </Field>
              <Button
                className="mt-3"
                loading={busy || resUploading}
                disabled={!resForm.title || !resForm.file_url}
                onClick={addResource}
              >
                <Plus className="h-4 w-4" /> Add resource
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Class list (participants) modal */}
      {classSession && (
        <Modal open onClose={() => setClassSession(null)} title={`Class list — ${classSession.title}`} wide>
          <p className="mb-3 text-xs text-muted">
            Payment status of enrolled students. For lesson-linked classes, students without the lesson purchase are blocked
            automatically; you can additionally block anyone manually.
          </p>
          {participantsLoading ? (
            <LoadingBlock label="Loading class list..." />
          ) : participants.length === 0 ? (
            <p className="text-sm text-muted">No enrolled students yet.</p>
          ) : (
            <Table headers={["Student", "Payment", "Lesson access", "Status", "Action"]}>
              {participants.map((p) => (
                <tr key={p.user_id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted">{p.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      status={
                        p.payment_status === "paid"
                          ? "published"
                          : p.payment_status === "awaiting_verification"
                          ? "pending"
                          : p.payment_status === "expired"
                          ? "failed"
                          : "pending"
                      }
                    >
                      {p.payment_status === "paid"
                        ? "Paid"
                        : p.payment_status === "awaiting_verification"
                        ? "Awaiting verification"
                        : p.payment_status === "expired"
                        ? "Expired"
                        : "Not paid"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {classSession.lesson_id ? (
                      p.has_lesson_access ? (
                        <span className="text-success">Yes</span>
                      ) : (
                        <span className="text-danger">No</span>
                      )
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.blocked ? <Badge status="failed">Blocked</Badge> : <Badge status="published">Allowed</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className={`px-3 py-1.5 text-xs ${p.blocked ? "btn-ghost" : "btn-danger"}`}
                      onClick={() => toggleBlock(p)}
                      disabled={busy}
                    >
                      {p.blocked ? "Unblock" : "Block"}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Modal>
      )}
    </div>
  );
}

function Emptyish({ label }: { label: string }) {
  return <Card className="p-8 text-center text-muted">{label}</Card>;
}
