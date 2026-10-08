import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, GraduationCap, Timer } from "lucide-react";
import { api } from "../../lib/api";
import type { Enrolment, Exam } from "../../lib/types";
import { Badge, Card, EmptyState, LoadingBlock } from "../../components/ui";

interface Row {
  exam: Exam;
  programmeTitle: string;
}

export default function Exams() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const enrolments = await api.get<Enrolment[]>("/enrolments/mine");
        const active = enrolments.filter((e) => e.status === "active");
        const all: Row[] = [];
        for (const e of active) {
          const exams = await api.get<Exam[]>(`/programmes/${e.programme_id}/exams`).catch(() => []);
          exams.forEach((exam) => all.push({ exam, programmeTitle: e.programme?.title || "" }));
        }
        setRows(all);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingBlock />;

  return (
    <div className="min-h-screen bg-bg">
      <StudentHeader title="Exams" />
      <div className="container-x py-8">
        {rows.length === 0 ? (
          <EmptyState title="No exams available" subtitle="Enrol in a programme with exams to see them here." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map(({ exam, programmeTitle }) => (
              <Card key={exam.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{exam.title}</h3>
                    <p className="text-sm text-muted">{programmeTitle}</p>
                  </div>
                  <Badge status={exam.status} />
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Timer className="h-4 w-4" /> {exam.duration_min} min
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4" /> Pass ≥ {exam.pass_marks}
                  </span>
                  <span>{exam.question_count ?? exam.questions?.length ?? "?"} questions</span>
                  <span>
                    Attempts: {exam.attempts_used ?? 0}/{exam.max_attempts}
                  </span>
                </div>
                <Link
                  to={`/dashboard/exams/${exam.id}/take`}
                  className={`mt-5 w-full ${(exam.attempts_used ?? 0) >= exam.max_attempts ? "btn-ghost pointer-events-none opacity-50" : "btn-primary"}`}
                >
                  {(exam.attempts_used ?? 0) >= exam.max_attempts ? "Attempts used" : "Start Exam"}
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function StudentHeader({ title }: { title: string }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="container-x flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="btn-ghost">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <h1 className="text-lg font-bold">{title}</h1>
        </div>
        <nav className="hidden gap-2 text-sm sm:flex">
          <Link to="/dashboard/exams" className="nav-link">Exams</Link>
          <Link to="/dashboard/results" className="nav-link">Results</Link>
          <Link to="/dashboard/certificates" className="nav-link">Certificates</Link>
          <Link to="/dashboard/payments" className="nav-link">Payments</Link>
        </nav>
      </div>
    </header>
  );
}
