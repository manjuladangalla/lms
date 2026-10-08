import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Calendar } from "lucide-react";
import { api } from "../../lib/api";
import type { Membership } from "../../lib/types";
import { Badge, Card, EmptyState, LoadingBlock } from "../../components/ui";
import { useRealtime } from "../../lib/realtime";
import { StudentHeader } from "./Exams";

export default function MembershipPage() {
  const [items, setItems] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Membership[]>("/memberships/mine")
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  useRealtime((event) => {
    if (event === "membership.updated") {
      api.get<Membership[]>("/memberships/mine").then(setItems).catch(() => {});
    }
  });

  const active = items.find(
    (m) => m.status === "active" && m.expires_at && new Date(m.expires_at) > new Date()
  );

  return (
    <div className="min-h-screen bg-bg">
      <StudentHeader title="Membership" />
      <div className="container-x py-8">
        {loading ? (
          <LoadingBlock />
        ) : (
          <>
            <Card className="mb-6 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="rounded-2xl bg-warning/15 p-4 text-warning">
                    <Crown className="h-7 w-7" />
                  </span>
                  <div>
                    <p className="text-sm text-muted">Current status</p>
                    <p className="text-xl font-extrabold">
                      {active ? active.plan?.name || "Active membership" : "No active membership"}
                    </p>
                    {active && (active.plan?.discount_percent ?? 0) > 0 && (
                      <p className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        Saving {active.plan?.discount_percent}% on every course
                      </p>
                    )}
                    {active?.expires_at && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                        <Calendar className="h-4 w-4" /> Expires {new Date(active.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <Link to="/memberships" className="btn-primary">
                  {active ? "Renew / Upgrade" : "View Plans"}
                </Link>
              </div>
            </Card>

            <h2 className="mb-3 text-lg font-bold">Membership history</h2>
            {items.length === 0 ? (
              <EmptyState title="No memberships yet" subtitle="A membership plan discounts every course fee by 25%–100%." />
            ) : (
              <div className="space-y-3">
                {items.map((m) => (
                  <Card key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold">
                        {m.plan?.name || "Plan"}
                        {(m.plan?.discount_percent ?? 0) > 0 && (
                          <span className="ml-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            −{m.plan?.discount_percent}% on courses
                          </span>
                        )}
                        {m.cycle && (
                          <span className="ml-2 text-xs font-normal text-muted">Billed {m.cycle}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {m.started_at ? `Started ${new Date(m.started_at).toLocaleDateString()}` : "Not started"}
                        {m.expires_at ? ` · Expires ${new Date(m.expires_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {m.payment && (
                        <span className="text-sm text-muted">
                          {m.payment.currency} {m.payment.amount}
                        </span>
                      )}
                      <Badge
                        status={
                          m.status === "active" && m.expires_at && new Date(m.expires_at) < new Date()
                            ? "expired"
                            : m.status
                        }
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
