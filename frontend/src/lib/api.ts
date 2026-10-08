import type { Tokens } from "./types";

export const API_BASE =
  (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_URL ||
  "http://localhost:8000/api/v1";

const ACCESS_KEY = "lms_access";
const REFRESH_KEY = "lms_refresh";

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(tokens: { access_token: string; refresh_token: string }) {
    localStorage.setItem(ACCESS_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = tokenStore.refresh;
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) {
          tokenStore.clear();
          return false;
        }
        const data: Tokens = await res.json();
        tokenStore.set(data);
        return true;
      } catch {
        tokenStore.clear();
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: Method; body?: unknown; formData?: FormData; auth?: boolean; retry?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  const method = options.method || "GET";
  if (options.body && !options.formData) headers["Content-Type"] = "application/json";
  const access = tokenStore.access;
  if (access) headers["Authorization"] = `Bearer ${access}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: options.formData || (options.body ? JSON.stringify(options.body) : undefined),
  });

  if (res.status === 401 && options.retry !== false && tokenStore.refresh) {
    const ok = await tryRefresh();
    if (ok) return request<T>(path, { ...options, retry: false });
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail || data);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", formData }),
};

export function publicFileUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  const base = API_BASE.replace(/\/api\/v1\/?$/, "");
  return `${base}/${url.replace(/^\//, "")}`;
}
