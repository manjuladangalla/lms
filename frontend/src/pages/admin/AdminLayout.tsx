import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import {
  BadgeDollarSign,
  Award,
  BookOpen,
  FolderKanban,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ScrollText,
  Settings,
  Server,
  Users,
  CheckSquare,
  ClipboardList,
  HeartHandshake,
  Tag,
  Image,
} from "lucide-react";
import { useAuth } from "../../store/auth";
import { Logo, ThemeSwitcher } from "../../components/layout";

const links = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true, roles: ["admin", "lecturer", "counselor"] },
  { to: "/admin/programmes", label: "Programmes", icon: BookOpen, roles: ["admin", "lecturer"] },
  { to: "/admin/enrolments", label: "Enrolments", icon: ClipboardList, roles: ["admin"] },
  { to: "/admin/payments", label: "Payments", icon: BadgeDollarSign, roles: ["admin"] },
  { to: "/admin/students", label: "Users", icon: Users, roles: ["admin"] },
  { to: "/admin/grading", label: "Grading Queue", icon: CheckSquare, roles: ["admin", "lecturer"] },
  { to: "/admin/results", label: "Results", icon: ScrollText, roles: ["admin", "lecturer"] },
  { to: "/admin/certificates", label: "Certificates", icon: Award, roles: ["admin", "lecturer"] },
  { to: "/admin/plans", label: "Membership Plans", icon: FolderKanban, roles: ["admin"] },
  { to: "/admin/promotions", label: "Promotions", icon: Tag, roles: ["admin"] },
  { to: "/admin/banners", label: "Banners", icon: Image, roles: ["admin"] },
  { to: "/admin/counselling", label: "Counselling", icon: HeartHandshake, roles: ["admin", "counselor"] },
  { to: "/admin/pages", label: "Pages", icon: FileText, roles: ["admin"] },
  { to: "/admin/messages", label: "Messages", icon: MessageSquare, roles: ["admin"] },
  { to: "/admin/settings", label: "Institute Settings", icon: Settings, roles: ["admin"] },
  { to: "/admin/system", label: "System", icon: Server, roles: ["admin"] },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Logo size="sm" />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {links
            .filter((l) => !l.roles || !role || l.roles.includes(role))
            .map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? "bg-gradient-to-r from-primary to-primary2 text-white shadow-soft" : "text-muted hover:bg-surface2 hover:text-ink"
                  }`
                }
              >
                <l.icon className="h-4 w-4" />
                {l.label}
              </NavLink>
            ))}
        </nav>
        <div className="border-t border-border p-3">
          <NavLink to="/" className="nav-link flex items-center gap-2">
            View website
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:ml-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{user?.name}</p>
            <p className="text-xs capitalize text-muted">{user?.role} panel</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitcher compact />
            <button
              className="btn-ghost"
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="border-b border-border bg-surface px-4 py-2 lg:hidden">
          <nav className="flex gap-1 overflow-x-auto">
            {links
              .filter((l) => !l.roles || !role || l.roles.includes(role))
              .map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className="nav-link whitespace-nowrap">
                  {l.label}
                </NavLink>
              ))}
          </nav>
        </div>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
