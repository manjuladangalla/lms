import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { Attempt } from "../../lib/types";
import { Badge, Card, EmptyState, LoadingBlock, Table } from "../../components/ui";
import { StudentHeader } from "./Exams";

export default function Results() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Attempt[]>("/attempts/mine")
      .then(setAttempts)
      .finally(() => setLoading(false));
  }, []);

  const passed = attempts.filter((a) => a.is_passed).length;

  return (
    <div className="min-h-screen bg-bg">
      <StudentHeader title="Results" />
      <div className="container-x py-8">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm text-muted">Total Attempts</p>
            <p className="text-2xl font-extrabold">{attempts.length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted">Passed</p>
            <p className="text-2xl font-extrabold text-success">{passed}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted">Avg Score</p>
            <p className="text-2xl font-extrabold">
              {attempts.length
                ? Math.round(attempts.reduce((s, a) => s + (a.percentage || 0), 0) / attempts.length)
                : 0}
              %
            </p>
          </Card>
        </div>

        {loading ? (
          <LoadingBlock />
        ) : attempts.length === 0 ? (
          <EmptyState title="No results yet" subtitle="Your exam results will appear here." />
        ) : (
          <Table headers={["Exam", "Programme", "Score", "Percent", "Status", "Date"]}>
            {attempts.map((a) => (
              <tr key={a.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3 font-medium">{a.exam?.title || "—"}</td>
                <td className="px-4 py-3 text-muted">{a.programme?.title || "—"}</td>
                <td className="px-4 py-3">
                  {a.obtained != null ? `${a.obtained}/${a.total}` : "—"}
                </td>
                <td className="px-4 py-3 font-semibold">{a.percentage ?? 0}%</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <Badge status={a.status} />
                    {a.is_passed && <Badge status="published">Pass</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}
