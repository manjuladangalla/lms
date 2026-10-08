import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`h-5 w-5 animate-spin ${className}`} />;
}

export function LoadingBlock({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <Spinner className="h-8 w-8 text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Alert({ type = "info", children }: { type?: "info" | "error" | "success" | "warning"; children: ReactNode }) {
  const styles = {
    info: "border-primary/30 bg-primary/10 text-ink",
    error: "border-danger/30 bg-danger/10 text-ink",
    success: "border-success/30 bg-success/10 text-ink",
    warning: "border-warning/30 bg-warning/10 text-ink",
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles[type]}`}>{children}</div>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "soft"; loading?: boolean };
export function Button({ variant = "primary", loading, className = "", children, ...rest }: BtnProps) {
  const cls =
    variant === "primary"
      ? "btn-primary"
      : variant === "danger"
        ? "btn-danger"
        : variant === "soft"
          ? "btn bg-primary/10 text-primary hover:bg-primary/20"
          : "btn-ghost";
  return (
    <button className={`${cls} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`input ${className}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`input min-h-[100px] ${className}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select className={`input ${className}`} {...rest}>
      {children}
    </select>
  );
}

const badgeColors: Record<string, string> = {
  active: "bg-success/15 text-success",
  published: "bg-success/15 text-success",
  succeeded: "bg-success/15 text-success",
  issued: "bg-success/15 text-success",
  graded: "bg-success/15 text-success",
  draft: "bg-muted/15 text-muted",
  pending: "bg-warning/15 text-warning",
  pending_verification: "bg-warning/15 text-warning",
  awaiting_verification: "bg-warning/15 text-warning",
  grading: "bg-warning/15 text-warning",
  in_progress: "bg-primary/15 text-primary",
  submitted: "bg-primary/15 text-primary",
  failed: "bg-danger/15 text-danger",
  revoked: "bg-danger/15 text-danger",
  cancelled: "bg-danger/15 text-danger",
  expired: "bg-danger/15 text-danger",
  suspended: "bg-danger/15 text-danger",
  refunded: "bg-muted/15 text-muted",
  new: "bg-primary/15 text-primary",
  read: "bg-muted/15 text-muted",
  replied: "bg-success/15 text-success",
};

export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  const key = status || "";
  return <span className={`badge ${badgeColors[key] || "bg-surface2 text-muted"}`}>{children || key.replace(/_/g, " ")}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 max-h-[90vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-soft animate-fadeUp`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-base font-semibold">{title}</p>
      {subtitle && <p className="max-w-md text-sm text-muted">{subtitle}</p>}
      {action}
    </div>
  );
}

export function StatCard({ label, value, icon, accent = "from-primary to-primary2" }: { label: string; value: string | number; icon?: ReactNode; accent?: string }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${accent} opacity-15`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
        </div>
        {icon && <div className="rounded-xl bg-surface2 p-2.5 text-primary">{icon}</div>}
      </div>
    </Card>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface2">
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-surface2/60 text-xs uppercase tracking-wide text-muted">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>
        Page {page} of {pages} · {total} items
      </span>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
