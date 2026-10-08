import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { Theme } from "../lib/types";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  themes: { id: Theme; label: string; hint: string }[];
}

const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: "normal", label: "Normal", hint: "Modern indigo" },
  { id: "light", label: "Light", hint: "Clean minimal" },
  { id: "dark", label: "Dark", hint: "Easy on eyes" },
];

const ThemeContext = createContext<ThemeCtx>({
  theme: "normal",
  setTheme: () => {},
  themes: THEMES,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("lms_theme") as Theme | null;
    return saved && ["light", "dark", "normal"].includes(saved) ? saved : "normal";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("lms_theme", theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    const hasAuth = Boolean(localStorage.getItem("lms_access"));
    if (hasAuth) {
      api.patch("/auth/theme", { theme: t }).catch(() => {});
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme, themes: THEMES }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function applyServerTheme(theme?: Theme | null) {
  if (theme && ["light", "dark", "normal"].includes(theme)) {
    const local = localStorage.getItem("lms_theme") as Theme | null;
    if (!local) {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("lms_theme", theme);
    }
  }
}
