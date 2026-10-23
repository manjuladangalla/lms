import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { GraduationCap, LogOut, Menu, Monitor, Moon, Sun, X, LayoutDashboard, Shield, Users, ChevronDown, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../store/auth";
import { useTheme } from "../store/theme";
import { publicFileUrl } from "../lib/api";
import { portalFor } from "../lib/portal";
import type { Theme } from "../lib/types";

const themeIcon: Record<Theme, typeof Sun> = { normal: Monitor, light: Sun, dark: Moon };

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const CurrentIcon = themeIcon[theme] || Monitor;
  const sizeCls = compact ? "h-9 w-9" : "h-9 w-9";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref} title="Switch theme">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch theme"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`grid ${sizeCls} place-items-center rounded-xl border border-border bg-surface text-muted transition hover:bg-surface2 hover:text-ink ${
          open ? "text-ink" : ""
        }`}
      >
        <CurrentIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 min-w-40 overflow-hidden rounded-xl border border-border bg-surface shadow-soft animate-fadeUp" role="menu">
          {themes.map((t) => {
            const Icon = themeIcon[t.id];
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                role="menuitem"
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-semibold transition ${
                  active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface2 hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{t.label}</span>
                {active && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function splitName(name: string): [string, string] {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [words[0] || "LMS Institute", ""];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

export function Logo({ size = "md", variant = "full" }: { size?: "sm" | "md" | "lg"; variant?: "full" | "short" }) {
  const { settings } = useAuth();
  const logo = publicFileUrl(settings?.logo_url);
  const fullName = settings?.site_name || "LMS Institute";
  const short = (settings?.short_name || "").trim();
  const siteName = variant === "short" && short ? short : fullName;
  const [line1, line2] = variant === "short" && short ? [short, ""] : splitName(fullName);
  const dim = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const l1 = size === "lg" ? "text-xl" : size === "sm" ? "text-[0.82rem]" : "text-[0.95rem]";
  const l2 = size === "lg" ? "text-[0.72rem]" : "text-[0.62rem]";
  const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <Link to="/" className="group flex items-center gap-3.5">
      {logo ? (
        <img
          src={logo}
          alt={siteName}
          className={`${dim} shrink-0 rounded-full bg-white object-cover p-1 shadow-soft transition`}
        />
      ) : (
        <span
          className={`${dim} grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary via-primary2 to-accent text-white shadow-soft transition`}
        >
          <GraduationCap className={icon} />
        </span>
      )}
      <span className="flex min-w-0 flex-col text-left leading-[1.12]">
        <span className={`${l1} font-extrabold tracking-tight text-ink`}>{line1}</span>
        {line2 && (
          <span className={`${l2} font-bold uppercase tracking-[0.16em] text-muted`}>{line2}</span>
        )}
      </span>
    </Link>
  );
}

const programmeLinks = [
  { to: "/classes", label: "Classes" },
  { to: "/courses", label: "Courses" },
  { to: "/diploma", label: "Diploma" },
];

const publicLinks = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/memberships", label: "Memberships" },
  { to: "/counselling", label: "Counselling" },
  { to: "/verify", label: "Verify" },
  { to: "/contact", label: "Contact" },
];

function isProgrammePath(pathname: string): boolean {
  return programmeLinks.some((p) => pathname === p.to);
}

function ProgrammeMenu({ onNavigate, mobile = false }: { onNavigate?: () => void; mobile?: boolean }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = isProgrammePath(pathname);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1 ${mobile ? "nav-link w-full" : "nav-link"} ${
          active && !open ? "bg-surface2 text-ink" : ""
        }`}
      >
        Our Programmes
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          className={
            mobile
              ? "mt-1 flex flex-col gap-1 rounded-xl border border-border bg-surface p-1 shadow-soft"
              : "absolute left-0 top-full z-50 mt-1 min-w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-soft animate-fadeUp"
          }
        >
          {programmeLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className={({ isActive }) =>
                mobile
                  ? `nav-link ${isActive ? "bg-surface2 text-ink" : ""}`
                  : `block px-4 py-2.5 text-sm font-semibold transition ${
                      isActive ? "bg-surface2 text-ink" : "text-muted hover:bg-surface2 hover:text-ink"
                    }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const dashboardHref = portalFor(user?.role);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-lg">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Logo variant="short" />
        <nav className="hidden items-center gap-1 lg:flex">
          {publicLinks.slice(0, 2).map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `nav-link ${isActive ? "bg-surface2 text-ink" : ""}`} end={l.to === "/"}>
              {l.label}
            </NavLink>
          ))}
          <ProgrammeMenu />
          {publicLinks.slice(2).map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `nav-link ${isActive ? "bg-surface2 text-ink" : ""}`} end={l.to === "/"}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          {user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to={dashboardHref} className="btn-ghost">
                {user.role === "admin" ? <Shield className="h-4 w-4" /> : <LayoutDashboard className="h-4 w-4" />}
                Dashboard
              </Link>
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
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/portal" className="btn-ghost h-10 whitespace-nowrap">
                <Users className="h-4 w-4" />
                Student Portal
              </Link>
              <Link to="/login" className="btn-ghost h-10 whitespace-nowrap">
                Login
              </Link>
              <Link to="/register" className="btn-primary h-10 whitespace-nowrap">
                Get Started
              </Link>
            </div>
          )}
          <button className="rounded-lg p-2 text-ink lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border bg-surface px-4 py-3 lg:hidden">
          <nav className="flex flex-col gap-1">
            {publicLinks.slice(0, 2).map((l) => (
              <NavLink key={l.to} to={l.to} className="nav-link" end={l.to === "/"} onClick={() => setOpen(false)}>
                {l.label}
              </NavLink>
            ))}
            <ProgrammeMenu mobile onNavigate={() => setOpen(false)} />
            {publicLinks.slice(2).map((l) => (
              <NavLink key={l.to} to={l.to} className="nav-link" end={l.to === "/"} onClick={() => setOpen(false)}>
                {l.label}
              </NavLink>
            ))}
            <div className="my-2 h-px bg-border" />
            {user ? (
              <Link to={dashboardHref} className="nav-link" onClick={() => setOpen(false)}>
                Dashboard
              </Link>
            ) : (
              <div className="flex flex-col gap-2">
                <Link to="/portal" className="btn-ghost h-10 whitespace-nowrap" onClick={() => setOpen(false)}>
                  Student Portal
                </Link>
                <div className="flex gap-2">
                  <Link to="/login" className="btn-ghost h-10 flex-1 whitespace-nowrap" onClick={() => setOpen(false)}>
                    Login
                  </Link>
                  <Link to="/register" className="btn-primary h-10 flex-1 whitespace-nowrap" onClick={() => setOpen(false)}>
                    Get Started
                  </Link>
                </div>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const { settings } = useAuth();
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="container-x grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-muted">{settings?.tagline || "Learn. Grow. Get Certified."}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
            {settings?.facebook && <a href={settings.facebook}>Facebook</a>}
            {settings?.youtube && <a href={settings.youtube}>YouTube</a>}
            {settings?.linkedin && <a href={settings.linkedin}>LinkedIn</a>}
            {settings?.instagram && <a href={settings.instagram}>Instagram</a>}
          </div>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold">Programmes</p>
          <div className="flex flex-col gap-2 text-sm text-muted">
            <Link to="/classes">Classes</Link>
            <Link to="/courses">Courses</Link>
            <Link to="/diploma">Diploma</Link>
            <Link to="/memberships">Memberships</Link>
            <Link to="/counselling">Counselling</Link>
          </div>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold">Company</p>
          <div className="flex flex-col gap-2 text-sm text-muted">
            <Link to="/about">About Us</Link>
            <Link to="/contact">Contact Us</Link>
            <Link to="/verify">Certificate Verification</Link>
          </div>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold">Contact</p>
          <div className="flex flex-col gap-2 text-sm text-muted">
            {settings?.contact_email && <span>{settings.contact_email}</span>}
            {settings?.contact_phone && <span>{settings.contact_phone}</span>}
            {settings?.address && <span>{settings.address}</span>}
          </div>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} {settings?.site_name || "LMS Institute"}. {settings?.footer_text || ""}
      </div>
    </footer>
  );
}
