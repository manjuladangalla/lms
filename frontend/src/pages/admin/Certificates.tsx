import { useEffect, useRef, useState } from "react";
import { api, ApiError, publicFileUrl } from "../../lib/api";
import type { CertField, CertificateTemplate, Enrolment, Paged, Programme, Certificate } from "../../lib/types";
import { useAuth } from "../../store/auth";
import { Alert, Badge, Button, Field, Input, LoadingBlock, Modal, Pagination, Table } from "../../components/ui";

const FIELD_LABELS: Record<string, string> = {
  heading: "Heading",
  institute_name: "Institute name",
  student_name: "Student name",
  programme_name: "Programme / course",
  completion_date: "Completion date",
  final_grade: "Final grade",
  cert_no: "Certificate no",
  issuer: "Authorised by",
  qr: "QR code",
};

const SAMPLE_VALUES: Record<string, string> = {
  heading: "CERTIFICATE OF COMPLETION",
  institute_name: "Sample Institute",
  student_name: "John Doe",
  programme_name: "Web Development Bootcamp",
  completion_date: "Completion Date: 01 January 2026",
  final_grade: "Final Grade: 90%",
  cert_no: "Certificate No: LMS-2026-000001",
  issuer: "Authorized by: Sample Institute",
};

type Tab = "list" | "template";

export default function AdminCertificates() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("list");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Certificates</h1>
          <p className="text-sm text-muted">
            Issue QR-verified certificates — system PDF or pre-printed fill-in layout.
          </p>
        </div>
      </div>

      <div className="mb-5 flex gap-1 border-b border-border">
        <button
          className={`px-4 py-2 text-sm font-semibold ${tab === "list" ? "border-b-2 border-primary text-primary" : "text-muted hover:text-ink"}`}
          onClick={() => setTab("list")}
        >
          Certificates
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold ${tab === "template" ? "border-b-2 border-primary text-primary" : "text-muted hover:text-ink"}`}
          onClick={() => setTab("template")}
        >
          Print template{!isAdmin ? " (view only)" : ""}
        </button>
      </div>

      {tab === "list" ? <CertificatesList /> : <TemplateDesigner readOnly={!isAdmin} />}
    </div>
  );
}

/* ---------------- List + actions ---------------- */

function CertificatesList() {
  const [data, setData] = useState<Paged<Certificate> | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [searchStudent, setSearchStudent] = useState("");
  const [students, setStudents] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedProg, setSelectedProg] = useState("");
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [eligibility, setEligibility] = useState<{ eligible: boolean; reason: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Certificate | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.get<Paged<Certificate>>(`/certificates?page=${page}&size=15${q ? `&q=${encodeURIComponent(q)}` : ""}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [q, page]);

  const searchUsers = async (term: string) => {
    setSearchStudent(term);
    if (term.length < 2) {
      setStudents([]);
      return;
    }
    const r = await api.get<{ items: { id: string; name: string; email: string }[] }>(
      `/users?q=${encodeURIComponent(term)}&role=student&size=5`
    );
    setStudents(r.items);
  };

  const openIssue = async () => {
    setOpen(true);
    const progs = await api.get<{ items: Programme[] }>("/programmes?size=100");
    setProgrammes(progs.items);
  };

  const onSelectUser = async (uid: string) => {
    setSelectedUser(uid);
    setEligibility(null);
    try {
      const all = await api.get<Paged<Enrolment>>("/enrolments?size=100");
      setEnrolments(all.items.filter((e) => e.user_id === uid));
    } catch {
      setEnrolments([]); // lecturers cannot list all enrolments — summary skipped
    }
    setSelectedProg("");
  };

  const onSelectProgramme = async (pid: string) => {
    setSelectedProg(pid);
    if (selectedUser && pid) {
      try {
        const r = await api.get<{ eligible: boolean; reason: string }>(
          `/certificates/eligibility/${pid}?user_id=${selectedUser}`
        );
        setEligibility(r);
      } catch {
        setEligibility({ eligible: false, reason: "Check failed" });
      }
    }
  };

  const issue = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/certificates", { user_id: selectedUser, programme_id: selectedProg });
      setOpen(false);
      setSelectedUser("");
      setSelectedProg("");
      setEligibility(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Issue failed");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this certificate?")) return;
    try {
      await api.post(`/certificates/${id}/revoke`);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Revoke failed");
    }
  };

  const regenerate = async (id: string) => {
    try {
      await api.post(`/certificates/${id}/regenerate`, { mode: "all" });
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Regenerate failed");
    }
  };

  const openEdit = (c: Certificate) => {
    setEditing(c);
    setEditError("");
    setEditValues({
      student_name: c.print_values?.student_name || c.student_name,
      programme_name: c.print_values?.programme_name || c.programme_name,
      completion_date: c.print_values?.completion_date || "",
      final_grade: c.print_values?.final_grade || "",
      issuer: c.print_values?.issuer || "",
      heading: c.print_values?.heading || "",
      institute_name: c.print_values?.institute_name || "",
      cert_no: c.print_values?.cert_no || "",
    });
  };

  const saveEdit = async (regenerateToo: boolean) => {
    if (!editing) return;
    setEditBusy(true);
    setEditError("");
    try {
      // Blank fields clear their override (fall back to the issued values)
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(editValues)) {
        const isDefaulted =
          (k === "student_name" && v === editing.student_name) ||
          (k === "programme_name" && v === editing.programme_name);
        payload[k] = isDefaulted ? "" : v;
      }
      await api.put(`/certificates/${editing.id}`, { print_values: payload });
      if (regenerateToo) await api.post(`/certificates/${editing.id}/regenerate`, { mode: "print" });
      setEditing(null);
      await load();
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Input className="max-w-sm" placeholder="Search cert no, student, programme..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Button onClick={openIssue}>Issue Certificate</Button>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Table headers={["Certificate No", "Student", "Programme", "Grade", "Completed", "Status", "Actions"]}>
            {(data?.items || []).map((c) => (
              <tr key={c.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3 font-mono text-sm font-semibold">{c.cert_no}</td>
                <td className="px-4 py-3">{c.print_values?.student_name || c.student_name}</td>
                <td className="px-4 py-3">{c.print_values?.programme_name || c.programme_name}</td>
                <td className="px-4 py-3 font-semibold">{c.final_grade != null ? `${c.final_grade}%` : "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {c.completion_date ? new Date(c.completion_date).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3"><Badge status={c.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <a href={`/verify/${c.cert_no}`} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">
                      Verify
                    </a>
                    {c.pdf_url && (
                      <a href={publicFileUrl(c.pdf_url) || "#"} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">
                        PDF
                      </a>
                    )}
                    {c.print_pdf_url && (
                      <a href={publicFileUrl(c.print_pdf_url) || "#"} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">
                        Print
                      </a>
                    )}
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => openEdit(c)}>
                      Edit details
                    </button>
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => regenerate(c.id)}>
                      Regenerate
                    </button>
                    {c.status === "issued" && (
                      <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => revoke(c.id)}>
                        Revoke
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={data?.page || 1} total={data?.total || 0} size={data?.size || 15} onPage={setPage} />
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Issue Certificate">
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
        <div className="space-y-4">
          <Field label="Search student">
            <Input value={searchStudent} onChange={(e) => searchUsers(e.target.value)} placeholder="Type student name or email..." />
            {students.length > 0 && (
              <div className="mt-1 rounded-xl border border-border">
                {students.map((s) => (
                  <button
                    key={s.id}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-surface2 ${selectedUser === s.id ? "bg-primary/10" : ""}`}
                    onClick={() => {
                      setSelectedUser(s.id);
                      setSearchStudent(`${s.name} (${s.email})`);
                      setStudents([]);
                      onSelectUser(s.id);
                    }}
                  >
                    {s.name} <span className="text-muted">· {s.email}</span>
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label="Programme">
            <select className="input" value={selectedProg} onChange={(e) => onSelectProgramme(e.target.value)}>
              <option value="">Select programme...</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </Field>
          {eligibility && (
            <Alert type={eligibility.eligible ? "success" : "warning"}>
              {eligibility.reason}
            </Alert>
          )}
          {enrolments.length > 0 && (
            <div className="rounded-xl bg-surface2 p-3 text-sm text-muted">
              Student's enrolments: {enrolments.map((e) => `${e.programme?.title || e.programme_id} (${e.progress_percent}%)`).join(", ")}
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={busy} disabled={!selectedUser || !selectedProg} onClick={issue}>
            Issue
          </Button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit details — ${editing.cert_no}` : ""}>
        {editError && <div className="mb-4"><Alert type="error">{editError}</Alert></div>}
        <p className="mb-3 text-xs text-muted">
          These values are filled into the pre-printed certificate. Leave a field empty to use the issued
          value, or type custom text. Save then regenerate the print PDF.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["student_name", "Student name"],
            ["programme_name", "Programme / course"],
            ["completion_date", "Completion date text"],
            ["final_grade", "Final grade text"],
            ["institute_name", "Institute name"],
            ["heading", "Heading"],
            ["cert_no", "Certificate no text"],
            ["issuer", "Authorised by"],
          ].map(([key, label]) => (
            <Field key={key} label={label as string}>
              <Input
                value={editValues[key] || ""}
                placeholder={key === "student_name" ? editing?.student_name : key === "programme_name" ? editing?.programme_name : "default"}
                onChange={(e) => setEditValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="soft" loading={editBusy} disabled={busy} onClick={() => saveEdit(false)}>
            Save
          </Button>
          <Button loading={editBusy} onClick={() => saveEdit(true)}>
            Save & regenerate print PDF
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- Template designer ---------------- */

function TemplateDesigner({ readOnly }: { readOnly: boolean }) {
  const [template, setTemplate] = useState<CertificateTemplate | null>(null);
  const [selected, setSelected] = useState<string>("student_name");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: string; startX: number; startY: number; fx: number; fy: number } | null>(null);

  useEffect(() => {
    api.get<CertificateTemplate>("/certificates/template").then(setTemplate).catch(() => setError("Failed to load template"));
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d || !template || !previewRef.current) return;
      const rect = previewRef.current.getBoundingClientRect();
      if (!rect.width) return;
      const dx = (e.clientX - d.startX) * (template.page.width / rect.width);
      const dy = (e.clientY - d.startY) * (template.page.height / rect.height);
      setTemplate((t) => {
        if (!t) return t;
        const f = t.fields[d.key];
        if (!f) return t;
        return {
          ...t,
          fields: {
            ...t.fields,
            [d.key]: {
              ...f,
              x: Math.round(Math.max(0, Math.min(t.page.width, d.fx + dx))),
              y: Math.round(Math.max(0, Math.min(t.page.height, d.fy - dy))),
            },
          },
        };
      });
    };
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [template]);

  const updateField = (key: string, patch: Partial<CertField>) => {
    setTemplate((t) => (t ? { ...t, fields: { ...t.fields, [key]: { ...t.fields[key], ...patch } } } : t));
  };

  const save = async () => {
    if (!template) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const saved = await api.put<CertificateTemplate>("/certificates/template", template);
      setTemplate(saved);
      setMessage("Template saved. Existing certificates need ‘Regenerate’ to pick up new positions.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!template) return <LoadingBlock />;

  const pw = template.page.width;
  const ph = template.page.height;
  const sel = template.fields[selected];

  const alignStyle = (f: CertField): React.CSSProperties => {
    const base: React.CSSProperties = { position: "absolute", bottom: `${(f.y / ph) * 100}%` };
    if ((f.align || "center") === "center") { base.left = `${(f.x / pw) * 100}%`; base.transform = "translateX(-50%)"; }
    else if (f.align === "right") { base.left = `${(f.x / pw) * 100}%`; base.transform = "translateX(-100%)"; }
    else { base.left = `${(f.x / pw) * 100}%`; }
    return base;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-muted">
            Drag fields on the sheet so they line up with your physical pre-printed certificate ({Math.round(pw)}×{Math.round(ph)} pt).
          </p>
          {!readOnly && (
            <div className="flex gap-2">
              <Button variant="soft" onClick={() => setTemplate({ page: { width: pw, height: ph }, fields: {} }) } loading={saving}>
                Reset positions
              </Button>
              <Button onClick={save} loading={saving}>Save template</Button>
            </div>
          )}
        </div>
        {message && <div className="mb-3"><Alert type="success">{message}</Alert></div>}
        {error && <div className="mb-3"><Alert type="error">{error}</Alert></div>}

        <div
          ref={previewRef}
          className="relative w-full select-none border-2 border-border bg-white shadow-soft"
          style={{ aspectRatio: `${pw} / ${ph}` }}
        >
          <div className="pointer-events-none absolute inset-3 border border-dashed border-gray-300" />
          {Object.entries(template.fields).map(([key, f]) => {
            const value =
              key === "qr" ? "" : SAMPLE_VALUES[key] || key;
            const dim = { opacity: f.visible === false ? 0.3 : 1 };
            if (key === "qr") {
              return (
                <div
                  key={key}
                  onMouseDown={(e) => { if (readOnly) return; e.preventDefault(); dragRef.current = { key, startX: e.clientX, startY: e.clientY, fx: f.x, fy: f.y }; setSelected(key); }}
                  className={`absolute flex cursor-move items-center justify-center border border-gray-400 bg-gray-100 text-[10px] text-gray-500 ${selected === key ? "ring-2 ring-primary" : ""}`}
                  style={{ ...alignStyle(f), width: `${(f.size / pw) * 100}%`, aspectRatio: "1", ...dim }}
                  title="QR"
                >
                  QR
                </div>
              );
            }
            return (
              <div
                key={key}
                onMouseDown={(e) => { if (readOnly) return; e.preventDefault(); dragRef.current = { key, startX: e.clientX, startY: e.clientY, fx: f.x, fy: f.y }; setSelected(key); }}
                className={`absolute cursor-move whitespace-nowrap text-gray-900 ${selected === key ? "rounded bg-primary/10 ring-2 ring-primary" : ""}`}
                style={{
                  ...alignStyle(f),
                  fontSize: `${Math.max(6, (f.size / ph) * (previewRef.current?.clientHeight || 400))}px`,
                  ...dim,
                }}
                title={FIELD_LABELS[key]}
              >
                {value}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Font size shown is scaled to the preview — the PDF uses the exact point size. Text baseline sits at the field's Y position.
        </p>
      </div>

      <div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="mb-3 font-bold">Fields</h3>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {Object.keys(template.fields).map((key) => (
              <button
                key={key}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${selected === key ? "bg-primary text-white" : "bg-surface2 text-muted hover:text-ink"}`}
                onClick={() => setSelected(key)}
              >
                {FIELD_LABELS[key] || key}
              </button>
            ))}
          </div>

          {sel && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="X (pt)">
                  <Input
                    type="number"
                    disabled={readOnly}
                    value={Math.round(sel.x)}
                    onChange={(e) => updateField(selected, { x: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Y (pt)">
                  <Input
                    type="number"
                    disabled={readOnly}
                    value={Math.round(sel.y)}
                    onChange={(e) => updateField(selected, { y: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Font size (pt)">
                  <Input
                    type="number"
                    disabled={readOnly || selected === "qr"}
                    value={Math.round(sel.size)}
                    onChange={(e) => updateField(selected, { size: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Align">
                  <select
                    className="input"
                    disabled={readOnly}
                    value={sel.align || "center"}
                    onChange={(e) => updateField(selected, { align: e.target.value as CertField["align"] })}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={sel.visible !== false}
                  onChange={(e) => updateField(selected, { visible: e.target.checked })}
                />
                Visible on print
              </label>
              <p className="text-xs text-muted">
                X/Y are PDF points from the bottom-left corner (page {Math.round(pw)}×{Math.round(ph)}).
                Turn off fields that are already printed on your paper.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
