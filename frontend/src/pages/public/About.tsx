import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { PageContent } from "../../lib/types";
import { useAuth } from "../../store/auth";
import { LoadingBlock } from "../../components/ui";
import { HeroDecor } from "../../components/HeroDecor";

export default function About() {
  const { settings } = useAuth();
  const [page, setPage] = useState<PageContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<PageContent>("/pages/about")
      .then(setPage)
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;

  return (
    <div className="relative overflow-hidden py-14">
      <HeroDecor variant="soft" />
      <div className="container-x relative">
      <div className="max-w-3xl">
        <p className="badge bg-primary/10 text-primary">About Us</p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight">{page?.title || "About Us"}</h1>
        {page?.subtitle && <p className="mt-2 text-lg text-muted">{page.subtitle}</p>}
        <div className="mt-8 space-y-4 text-base leading-relaxed text-muted">
          {(page?.body || settings?.about_body || "Loading...").split("\n").filter(Boolean).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        {page?.sections?.length ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {page.sections.map((s, i) => (
              <div key={i} className="card p-5">
                <h3 className="font-bold">{s.heading}</h3>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}
