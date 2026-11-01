import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useRealtime } from "./realtime";

export type MenuCounts = Record<string, number>;

/**
 * Badge counts for the current portal's menu, refreshed every 60s and on
 * relevant realtime events. Empty object if the endpoint fails.
 */
export function useMenuCounts(events: string[] = []) {
  const [counts, setCounts] = useState<MenuCounts>({});

  const load = useCallback(async () => {
    try {
      setCounts(await api.get<MenuCounts>("/dashboard/counts"));
    } catch {
      setCounts({});
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  useRealtime((event) => {
    if (events.includes(event) || event === "enrolment.updated") load();
  });

  return counts;
}

/** Small red pill shown next to a menu label. */
export function CountBadge({ value }: { value?: number }) {
  if (!value || value <= 0) return null;
  return (
    <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-danger px-1.5 text-[10px] font-bold leading-none text-white">
      {value > 99 ? "99+" : value}
    </span>
  );
}
