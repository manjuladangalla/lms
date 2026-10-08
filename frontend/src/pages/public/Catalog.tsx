import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { api, publicFileUrl } from "../../lib/api";
import type { Programme } from "../../lib/types";
import { EmptyState, Input, LoadingBlock } from "../../components/ui";
import { useRealtime } from "../../lib/realtime";
import { HeroDecor } from "../../components/HeroDecor";

const copy: Record<string, { title: string; subtitle: string }> = {
  class: { title: "Classes", subtitle: "Short, focused classes to quickly pick up new skills." },
  course: { title: "Courses", subtitle: "Structured courses with lessons, materials and exams." },
  diploma: { title: "Diploma Programmes", subtitle: "In-depth diplomas with final assessments and certificates." },
};

export default function Catalog({ type }: { type: "class" | "course" | "diploma" }) {
  const [items, setItems] = useState<Programme[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ items: Programme[] }>(`/programmes?type=${type}&size=50${q ? `&q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => setItems(r.items || []))
      .finally(() => setLoading(false));
  }, [type, q]);

  useRealtime((event) => {
    if (event === "programmes.changed") {
      api
        .get<{ items: Programme[] }>(`/programmes?type=${type}&size=50${q ? `&q=${encodeURIComponent(q)}` : ""}`)
        .then((r) => setItems(r.items || []))
        .catch(() => {});
    }
  });

  const c = copy[type];

  return (
    <div className="relative overflow-hidden py-14">
      <HeroDecor variant="band" />
      <div className="container-x relative">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="badge bg-primary/10 text-primary">{c.title}</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{c.title}</h1>
          <p className="mt-2 max-w-2xl text-muted">{c.subtitle}</p>
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="mt-10">
        {loading ? (
          <LoadingBlock />
        ) : items.length === 0 ? (
          <EmptyState title="No programmes found" subtitle="Check back soon — new programmes are added regularly." />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <Link key={p.id} to={`/programmes/${p.slug}`} className="card group overflow-hidden transition hover:-translate-y-1">
                <div className="h-36 bg-gradient-to-br from-primary/70 via-primary2/60 to-accent/60">
                  {p.cover_image_url && <img src={publicFileUrl(p.cover_image_url)!} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {p.category && <span>{p.category}</span>}
                    {p.duration && <span>· {p.duration}</span>}
                  </div>
                  <h3 className="mt-2 font-bold group-hover:text-primary">{p.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{p.summary}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-extrabold text-primary">
                      {p.is_free || p.price === 0 ? "Free" : `${p.currency || "USD"} ${p.price}`}
                    </span>
                    <ArrowRight className="h-4 w-4 text-primary transition group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
