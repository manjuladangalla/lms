import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Paged, User } from "../../lib/types";
import { Alert, Badge, Button, Field, Input, LoadingBlock, Modal, Pagination, Select, Table, Textarea } from "../../components/ui";

const empty = { name: "", email: "", password: "", role: "student", phone: "", specialty: "", bio: "" };

export default function AdminStudents() {
  const [data, setData] = useState<Paged<User> | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [profileForm, setProfileForm] = useState({ specialty: "", bio: "" });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: "15" });
      if (q) params.set("q", q);
      if (role) params.set("role", role);
      setData(await api.get<Paged<User>>(`/users?${params}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [q, role, page]);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/users", form);
      setOpen(false);
      setForm({ ...empty });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (u: User) => {
    try {
      await api.patch(`/users/${u.id}`, { status: u.status === "active" ? "suspended" : "active" });
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Update failed");
    }
  };

  const openProfile = (u: User) => {
    setProfileForm({ specialty: u.specialty || "", bio: u.bio || "" });
    setProfileUser(u);
  };

  const saveProfile = async () => {
    if (!profileUser) return;
    setBusy(true);
    setError("");
    try {
      await api.patch(`/users/${profileUser.id}`, profileForm);
      setProfileUser(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Users</h1>
          <p className="text-sm text-muted">Students, lecturers, counsellors and administrators.</p>
        </div>
        <Button onClick={() => setOpen(true)}>Add User</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search name or email..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="w-44">
          <option value="">All roles</option>
          <option value="student">Student</option>
          <option value="lecturer">Lecturer</option>
          <option value="counselor">Counsellor</option>
          <option value="admin">Admin</option>
        </Select>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Table headers={["Name", "Email", "Role", "Status", "Joined", "Actions"]}>
            {(data?.items || []).map((u) => (
              <tr key={u.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3 capitalize">{u.role}</td>
                <td className="px-4 py-3"><Badge status={u.status} /></td>
                <td className="px-4 py-3 text-muted">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    {u.role === "counselor" && (
                      <Button variant="ghost" onClick={() => openProfile(u)}>
                        Profile
                      </Button>
                    )}
                    <Button variant="soft" onClick={() => toggleStatus(u)}>
                      {u.status === "active" ? "Suspend" : "Activate"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={data?.page || 1} total={data?.total || 0} size={data?.size || 15} onPage={setPage} />
        </>
      )}

      <Modal open={!!profileUser} onClose={() => setProfileUser(null)} title={`Profile - ${profileUser?.name || ""}`}>
        <div className="space-y-4">
          <Field label="Specialty" hint="Shown on the public counselling page.">
            <Input value={profileForm.specialty} onChange={(e) => setProfileForm({ ...profileForm, specialty: e.target.value })} />
          </Field>
          <Field label="Profile">
            <Textarea value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setProfileUser(null)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={saveProfile}>
            Save
          </Button>
        </div>
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title="Add User">
        {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
        <div className="space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Password" hint="Default: changeme123 if left blank">
            <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="student">Student</option>
              <option value="lecturer">Lecturer</option>
              <option value="counselor">Counsellor</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          {form.role === "counselor" && (
            <>
              <Field label="Specialty" hint="Shown on the public counselling page.">
                <Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="e.g. Exam stress & career guidance" />
              </Field>
              <Field label="Profile" hint="Short bio, up to a few sentences.">
                <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Who they help and how they work." />
              </Field>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={busy} disabled={!form.name || !form.email} onClick={create}>Create</Button>
        </div>
      </Modal>
    </div>
  );
}
