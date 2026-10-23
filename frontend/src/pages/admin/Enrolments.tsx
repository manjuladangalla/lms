import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Enrolment, Paged, Programme, StudentNote } from "../../lib/types";
import { Alert, Badge, Button, Card, Field, Input, LoadingBlock, Modal, Pagination, Select, Table, Textarea } from "../../components/ui";
import { useRealtime } from "../../lib/realtime";

export default function AdminEnrolments() {
  const [data, setData] = useState<Paged<Enrolment> | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Enrolment | null>(null);
  const [newStatus, setNewStatus] = useState("active");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [enrolOpen, setEnrolOpen] = useState(false);
  const [studentEmail, setStudentEmail] = useState("");
  const [programmeId, setProgrammeId] = useState("");
  const [note, setNote] = useState("");
  const [programmes, setProgrammes] = useState<Programme[]>([]);

  const [noteTarget, setNoteTarget] = useState<Enrolment | null>(null);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteErr, setNoteErr] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: "15" });
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      setData(await api.get<Paged<Enrolment>>(`/enrolments?${params}`));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status, q, page]);

  useRealtime((event) => {
    if (event === "enrolment.created" || event === "enrolment.updated") load(true);
  });

  const save = async () => {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await api.patch(`/enrolments/${target.id}`, { status: newStatus, reason });
      setTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/enrolments/${id}/${action}`, { reason: null });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const openEnrol = async () => {
    setEnrolOpen(true);
    setStudentEmail("");
    setProgrammeId("");
    setNote("");
    setError("");
    try {
      const p = await api.get<Paged<Programme>>("/programmes?status=published&size=100");
      setProgrammes(p.items);
    } catch {
      setProgrammes([]);
    }
  };

  const submitEnrol = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/enrolments/staff", {
        student_email: studentEmail.trim(),
        programme_id: programmeId,
        note: note.trim() || null,
      });
      setEnrolOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Enrolment failed");
    } finally {
      setBusy(false);
    }
  };

  const openNotes = async (e: Enrolment) => {
    setNoteTarget(e);
    setNoteErr("");
    setNoteTitle("");
    setNoteBody("");
    setNotes([]);
    setNotesLoading(true);
    try {
      const res = await api.get<Paged<StudentNote>>(`/notes/student/${e.user_id}`);
      setNotes(res.items);
    } catch (err) {
      setNoteErr(err instanceof ApiError ? err.message : "Could not load notes");
    } finally {
      setNotesLoading(false);
    }
  };

  const addNote = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!noteTarget) return;
    setNoteBusy(true);
    setNoteErr("");
    try {
      await api.post("/notes", {
        student_id: noteTarget.user_id,
        programme_id: noteTarget.programme_id,
        title: noteTitle.trim(),
        body: noteBody.trim(),
      });
      setNoteTitle("");
      setNoteBody("");
      const res = await api.get<Paged<StudentNote>>(`/notes/student/${noteTarget.user_id}`);
      setNotes(res.items);
    } catch (err) {
      setNoteErr(err instanceof ApiError ? err.message : "Could not save note");
    } finally {
      setNoteBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Enrolments</h1>
          <p className="text-sm text-muted">Manage student access to programmes.</p>
        </div>
        <Button onClick={openEnrol}>+ Enrol a student</Button>
      </div>

      {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}

      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search student or course..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-52">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_verification">Pending verification</option>
          <option value="pending_acceptance">Pending acceptance</option>
          <option value="pending_approval">Pending approval</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
          <option value="revoked">Revoked</option>
        </Select>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Table headers={["Student", "Programme", "Progress", "Source", "Requested by", "Status", "Date", "Actions"]}>
            {(data?.items || []).map((e) => (
              <tr key={e.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3">
                  <p className="font-medium">{e.student?.name || "—"}</p>
                  <p className="text-xs text-muted">{e.student?.email}</p>
                </td>
                <td className="px-4 py-3">{e.programme?.title || e.programme_id}</td>
                <td className="px-4 py-3">{e.progress_percent || 0}%</td>
                <td className="px-4 py-3 capitalize">{e.source}</td>
                <td className="px-4 py-3 text-sm">
                  {e.requested_by_user ? (
                    <>
                      <p>{e.requested_by_user.name}</p>
                      <p className="text-xs capitalize text-muted">{e.requested_by_role}</p>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3"><Badge status={e.status} /></td>
                <td className="px-4 py-3 text-muted">
                  {e.created_at ? new Date(e.created_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {e.status === "pending_approval" ? (
                      <>
                        <Button onClick={() => decide(e.id, "approve")} disabled={busy}>Approve</Button>
                        <Button variant="danger" onClick={() => decide(e.id, "reject")} disabled={busy}>Reject</Button>
                      </>
                    ) : (
                      <Button variant="soft" onClick={() => { setTarget(e); setNewStatus(e.status); setReason(""); }}>
                        Manage
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => openNotes(e)} title="Lecture notes">
                      Note
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={data?.page || 1} total={data?.total || 0} size={data?.size || 15} onPage={setPage} />
        </>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title="Update Enrolment">
        <div className="space-y-4">
          <Card className="p-4 text-sm">
            <p className="font-semibold">{target?.student?.name}</p>
            <p className="text-muted">{target?.programme?.title}</p>
            <p className="mt-1 text-muted">Progress: {target?.progress_percent || 0}%</p>
          </Card>
          <div>
            <label className="label">Status</label>
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              <option value="active">Active (grant access)</option>
              <option value="pending_verification">Pending verification</option>
              <option value="pending_acceptance">Pending acceptance</option>
              <option value="pending_approval">Pending approval</option>
              <option value="rejected">Rejected</option>
              <option value="revoked">Revoked</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </Select>
          </div>
          <div>
            <label className="label">Reason / notes</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save</Button>
        </div>
      </Modal>

      <Modal open={enrolOpen} onClose={() => setEnrolOpen(false)} title="Enrol a student">
        <form onSubmit={submitEnrol} className="space-y-4">
          <Field label="Student's email" hint="The student must already have an account.">
            <Input
              type="email"
              required
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              placeholder="student@example.com"
            />
          </Field>
          <Field label="Programme">
            <Select value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} required>
              <option value="" disabled>Select a published programme</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown to the student/parent..." />
          </Field>
          <p className="text-xs text-muted">
            The enrolment stays <b>pending acceptance</b> until the student (or their parent) accepts it.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEnrolOpen(false)}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!studentEmail || !programmeId}>Send enrolment</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!noteTarget}
        onClose={() => setNoteTarget(null)}
        title={`Lecture notes — ${noteTarget?.student?.name || ""}`}
        wide
      >
        <div className="space-y-5">
          <Card className="p-4 text-sm">
            <p className="font-semibold">{noteTarget?.programme?.title}</p>
            <p className="text-muted">Notes you add are visible to this student and their parents.</p>
          </Card>

          <form onSubmit={addNote} className="space-y-3 rounded-xl border border-border p-4">
            {noteErr && <Alert type="error">{noteErr}</Alert>}
            <Field label="Title">
              <Input required maxLength={200} value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="e.g. Week 4 revision feedback" />
            </Field>
            <Field label="Note">
              <Textarea required maxLength={4000} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Write your note for the student..." />
            </Field>
            <Button type="submit" loading={noteBusy} disabled={!noteTitle.trim() || !noteBody.trim()}>
              Add note
            </Button>
          </form>

          <div className="space-y-3">
            <h4 className="text-sm font-bold">Existing notes</h4>
            {notesLoading ? (
              <LoadingBlock label="Loading notes..." />
            ) : notes.length === 0 ? (
              <p className="text-sm text-muted">No notes yet.</p>
            ) : (
              notes.map((n) => (
                <Card key={n.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{n.title}</p>
                    <span className="text-xs text-muted">
                      {n.created_at ? new Date(n.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted">{n.body}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-lg bg-surface2 px-2 py-1 font-semibold">{n.author?.name}</span>
                    {n.programme && (
                      <span className="rounded-lg bg-primary/10 px-2 py-1 text-primary">{n.programme.title}</span>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
