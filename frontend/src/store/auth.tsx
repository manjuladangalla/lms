import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, tokenStore } from "../lib/api";
import type { InstituteSettings, Tokens, User } from "../lib/types";
import { applyServerTheme } from "./theme";

interface AuthCtx {
  user: User | null;
  settings: InstituteSettings | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
   register: (name: string, email: string, password: string, phone: string) => Promise<{ requires_verification: boolean; email: string; dev_otp?: string; user?: User }>;
  verifyOtp: (email: string, code: string) => Promise<User>;
  resendOtp: (email: string) => Promise<void>;
  googleLogin: (payload: { id_token?: string; code?: string; redirect_uri?: string }) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<InstituteSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    try {
      const s = await api.get<InstituteSettings>("/settings");
      setSettings(s);
      document.title = s.site_name || "LMS";
      if (s.favicon_url) {
        let link = document.querySelector<HTMLLinkElement>("link[rel=icon]");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = s.favicon_url;
      }
    } catch {
      setSettings(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.access) {
      setUser(null);
      return;
    }
    try {
      const u = await api.get<User>("/auth/me");
      setUser(u);
      applyServerTheme(u.theme);
    } catch {
      setUser(null);
      tokenStore.clear();
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([refreshSettings(), refreshUser()]);
      setLoading(false);
    })();
  }, [refreshSettings, refreshUser]);

  const persist = (tokens: Tokens) => {
    tokenStore.set(tokens);
    setUser(tokens.user);
    applyServerTheme(tokens.user.theme);
  };

  const login = async (email: string, password: string) => {
    const tokens = await api.post<Tokens>("/auth/login", { email, password });
    persist(tokens);
    return tokens.user;
  };

  const register = async (name: string, email: string, password: string, phone: string) => {
    return api.post<{ requires_verification: boolean; email: string; dev_otp?: string }>("/auth/register", {
      name,
      email,
      password,
      phone,
    });
  };

  const verifyOtp = async (email: string, code: string) => {
    const tokens = await api.post<Tokens>("/auth/verify-otp", { email, code });
    persist(tokens);
    return tokens.user;
  };

  const resendOtp = async (email: string) => {
    await api.post("/auth/resend-otp", { email });
  };

  const googleLogin = async (payload: { id_token?: string; code?: string; redirect_uri?: string }) => {
    const tokens = await api.post<Tokens>("/auth/google", payload);
    persist(tokens);
    return tokens.user;
  };

  const logout = () => {
    const refreshToken = tokenStore.refresh;
    if (refreshToken) api.post("/auth/logout", { refresh_token: refreshToken }).catch(() => {});
    tokenStore.clear();
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, settings, loading, login, register, verifyOtp, resendOtp, googleLogin, logout, refreshUser, refreshSettings }),
    [user, settings, loading, refreshUser, refreshSettings]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
