import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Attempt, Paged } from "../../lib/types";
import { Badge, Button, Input, LoadingBlock, Pagination, Select, Table } from "../../components/ui";

export default function AdminResults() {
  const [data, setData] = useState<Paged<Attempt> | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: "15" });
      if (status) params.set("status_", status);
      const qs = params.toString().replace("status_=", "status=");
      setData(await api.get<Paged<Attempt>>(`/attempts?${qs}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status, page]);

  const publish = async (id: string) => {
    try {
      await api.post(`/attempts/${id}/publish`);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Publish failed");
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Results</h1>
        <p className="text-sm text-muted">All exam attempts across the institute.</p>
      </div>

      <div className="mb-4">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-52">
          <option value="">All statuses</option>
          <option value="grading">Grading</option>
          <option value="graded">Graded</option>
          <option value="published">Published</option>
        </Select>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Table headers={["Student", "Exam", "Score", "Percent", "Result", "Status", "Actions"]}>
            {(data?.items || []).map((a) => (
              <tr key={a.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3 font-medium">{a.student?.name || "—"}</td>
                <td className="px-4 py-3">{a.exam?.title || "—"}</td>
                <td className="px-4 py-3">{a.obtained ?? 0}/{a.total ?? "?"}</td>
                <td className="px-4 py-3 font-semibold">{a.percentage ?? 0}%</td>
                <td className="px-4 py-3">
                  {a.is_passed == null ? "—" : a.is_passed ? <Badge status="published">Pass</Badge> : <Badge status="failed">Fail</Badge>}
                </td>
                <td className="px-4 py-3"><Badge status={a.status} /></td>
                <td className="px-4 py-3">
                  {(a.status === "graded" || a.status === "grading") && (
                    <Button variant="soft" onClick={() => publish(a.id)}>Publish</Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={data?.page || 1} total={data?.total || 0} size={data?.size || 15} onPage={setPage} />
        </>
      )}
    </div>
  );
}
