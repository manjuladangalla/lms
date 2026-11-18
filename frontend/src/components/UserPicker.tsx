import { useEffect, useRef, useState } from "react";
import { Search, User as UserIcon } from "lucide-react";
import { api } from "../lib/api";
import type { Role } from "../lib/types";
import { Input, Spinner } from "./ui";

/** Minimal user shape returned by the search endpoints. */
export interface PickerUser {
  id: string;
  name: string;
  email: string;
  student_number?: string | null;
  phone?: string | null;
}

interface UserPickerProps {
  /** Whom to search for (admin/staff pages use /users). */
  role?: Role;
  /** Selected user (controlled). */
  value: PickerUser | null;
  /** Called with the picked user, or null when the text is edited/cleared. */
  onChange: (user: PickerUser | null) => void;
  /**
   * Search endpoint without the query string — `?q=` is appended.
   * Defaults to `/users`. The parent portal uses `/parents/students/search`.
   */
  endpoint?: string;
  /** Filter a fixed list locally instead of calling the API (e.g. linked children). */
  localOptions?: PickerUser[];
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}

function labelOf(u: PickerUser): string {
  return u.student_number ? `${u.name} (${u.student_number})` : `${u.name} (${u.email})`;
}

/**
 * Search-as-you-type user selector: type a name, email, student number, NIC
 * or passport number and pick from the dropdown.
 */
export function UserPicker({
  role = "student",
  value,
  onChange,
  endpoint = "/users",
  localOptions,
  placeholder,
  autoFocus,
  disabled,
  className = "",
}: UserPickerProps) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<PickerUser[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const lastId = useRef<string | null>(null);

  // Sync the input when the selection changes from outside (reset, preselect)
  useEffect(() => {
    const id = value?.id ?? null;
    if (id === lastId.current) return;
    lastId.current = id;
    setText(id && value ? labelOf(value) : "");
    if (id) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const term = text.trim();

  useEffect(() => {
    // Showing a picked user — nothing to search
    if (value && text === labelOf(value)) return;

    if (localOptions) {
      const t = term.toLowerCase();
      const f = !t
        ? localOptions
        : localOptions.filter((u) =>
            [u.name, u.email, u.student_number || ""].some((s) => s.toLowerCase().includes(t))
          );
      setHits(f.slice(0, 8));
      setBusy(false);
      setOpen(true);
      return;
    }

    if (term.length < 2) {
      setHits([]);
      setBusy(false);
      setOpen(false);
      return;
    }
    const id = ++seq.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const url = `${endpoint}?q=${encodeURIComponent(term)}&role=${role}&size=8`;
        const r = await api.get<{ items: PickerUser[] }>(url);
        if (seq.current !== id) return;
        setHits(r.items || []);
        setOpen(true);
      } catch {
        if (seq.current === id) setHits([]);
      } finally {
        if (seq.current === id) setBusy(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, endpoint, role, localOptions]);

  const onInput = (v: string) => {
    setText(v);
    setOpen(true);
    if (value) {
      lastId.current = null;
      onChange(null);
    }
  };

  const pick = (u: PickerUser) => {
    lastId.current = u.id;
    setText(labelOf(u));
    setOpen(false);
    onChange(u);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          className="pl-9 pr-9"
          value={text}
          autoFocus={autoFocus}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder || "Type to search by name, email or student no..."}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => term && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
        {busy && (
          <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        )}
      </div>

      {open && (hits.length > 0 || busy) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-surface shadow-lg">
          {busy && hits.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted">Searching...</p>
          )}
          {hits.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface2 ${
                value?.id === u.id ? "bg-primary/10" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(u);
              }}
            >
              <UserIcon className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted">
                  {u.student_number ? `${u.student_number} · ` : ""}
                  {u.email}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && !busy && hits.length === 0 && term.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm shadow-lg">
          No match for “{term}”
        </div>
      )}
    </div>
  );
}
