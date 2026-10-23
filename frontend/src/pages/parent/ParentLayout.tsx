import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Baby,
  LogOut,
  Menu,
  X,
  CalendarCheck,
} from "lucide-react";
import { useAuth } from "../../store/auth";
import { api } from "../../lib/api";
import type { Enrolment, Paged, ParentLink } from "../../lib/types";

const links = [
  { to: "/parent", label: "My Children", icon: Baby, end: true },
  { to: "/parent/enrol", label: "Enrol a Child", icon: CalendarCheck },
];

export default function ParentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const loadPending = useCallback(async () => {
    try {
      const res = await api.get<Paged<Enrolment>>("/parents/enrolments/awaiting");
      setPendingCount(res.items.length);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => {
    loadPending();
    const id = setInterval(loadPending, 60_000);
    return () => clearInterval(id);
  }, [loadPending]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const badge = (to: string) =>
    to === "/parent" && pendingCount > 0 ? pendingCount : undefined;

  const NavItems = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-1">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              isActive ? "bg-primary text-white" : "text-muted hover:bg-surface2 hover:text-foreground"
            }`
          }
        >
          <l.icon className="h-4 w-4" />
          <span className="flex-1">{l.label}</span>
          {badge(l.to) !== undefined && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {badge(l.to)}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary2 text-white">
            <Baby className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold">Parent Portal</div>
            <div className="text-[10px] text-muted">{user?.name}</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <NavItems />
        </div>
        <div className="border-t border-border p-4">
          <button onClick={handleLogout} className="btn-ghost w-full justify-start text-red-500">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="btn-ghost h-10 w-10 p-0">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold">Parent Portal</span>
          <button onClick={handleLogout} className="btn-ghost h-10 w-10 p-0 text-red-500">
            <LogOut className="h-4 w-4" />
          </button>
        </header>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 bg-card p-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-bold">Parent Portal</span>
                <button onClick={() => setOpen(false)} className="btn-ghost h-9 w-9 p-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <NavItems onNavigate={() => setOpen(false)} />
              <div className="mt-6 border-t border-border pt-4">
                <Link to="/" className="btn-ghost mb-2 w-full justify-start" onClick={() => setOpen(false)}>
                  Back to website
                </Link>
                <button onClick={handleLogout} className="btn-ghost w-full justify-start text-red-500">
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            </div>
          </div>
        )}
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
