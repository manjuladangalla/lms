export const BANNER_THEMES: Record<string, { label: string; className: string }> = {
  ocean: { label: "Ocean", className: "from-indigo-600 via-sky-500 to-cyan-400" },
  sunset: { label: "Sunset", className: "from-orange-500 via-rose-500 to-pink-500" },
  violet: { label: "Violet", className: "from-violet-600 via-fuchsia-500 to-purple-500" },
  emerald: { label: "Emerald", className: "from-emerald-600 via-teal-500 to-green-400" },
  rose: { label: "Rose", className: "from-rose-600 via-red-500 to-orange-400" },
  amber: { label: "Amber", className: "from-amber-500 via-yellow-500 to-orange-500" },
  sky: { label: "Sky", className: "from-sky-600 via-blue-500 to-indigo-500" },
  forest: { label: "Forest", className: "from-green-700 via-emerald-600 to-lime-500" },
};

export function bannerTheme(theme?: string) {
  return BANNER_THEMES[theme || "ocean"] || BANNER_THEMES.ocean;
}
