import { useId } from "react";

type Variant = "hero" | "band" | "soft";

/**
 * Decorative SVG layer for heading sections (blobs, dot grid, rings, waves).
 * Purely presentational: pointer-events-none, aria-hidden, theme-aware colors.
 */
export function HeroDecor({ variant = "hero", className = "" }: { variant?: Variant; className?: string }) {
  const raw = useId();
  const uid = raw.replace(/[:]/g, "");
  const dots = `dots-${uid}`;
  const gp1 = `gp1-${uid}`;
  const gp2 = `gp2-${uid}`;
  const mask = `mask-${uid}`;

  if (variant === "soft") {
    return (
      <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
        <svg className="absolute -right-20 -top-24 h-72 w-72 text-primary" viewBox="0 0 200 200" fill="none">
          <defs>
            <linearGradient id={gp1} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
              <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          <path
            d="M45.7,-58.4C58.3,-49.6,66.5,-34.2,70.6,-17.7C74.7,-1.2,74.7,16.4,67.4,30.3C60.1,44.2,45.5,54.4,30.1,60.6C14.6,66.8,-1.7,69,-17.6,65.4C-33.5,61.8,-49,52.4,-59.1,38.7C-69.2,25,-73.9,7,-71.1,-9.4C-68.3,-25.8,-58,-40.6,-44.7,-49.6C-31.4,-58.6,-15.7,-61.8,0.9,-62.9C17.5,-64,35,-67.2,45.7,-58.4Z"
            transform="translate(100 100)"
            fill={`url(#${gp1})`}
            className="opacity-40 blur-[2px]"
          />
        </svg>
        <svg className="absolute -left-16 bottom-0 h-52 w-52 text-accent" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="78" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
          <circle cx="100" cy="100" r="56" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 8" />
          <circle cx="100" cy="100" r="30" fill="currentColor" fillOpacity="0.10" />
        </svg>
        <svg className="absolute right-10 top-1/3 h-16 w-16 text-primary animate-floatSlow" viewBox="0 0 24 24" fill="none">
          <path d="M12 2v20M2 12h20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.4" />
        </svg>
      </div>
    );
  }

  if (variant === "band") {
    return (
      <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full text-primary" fill="none">
          <defs>
            <pattern id={dots} width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.7" fill="currentColor" fillOpacity="0.5" />
            </pattern>
            <linearGradient id={mask} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fff" stopOpacity="0" />
              <stop offset="45%" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id={`m-${mask}`}>
              <rect width="100%" height="100%" fill={`url(#${mask})`} />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${dots})`} mask={`url(#m-${mask})`} className="opacity-40" />
        </svg>

        <svg className="absolute -right-16 -top-20 h-64 w-64 text-primary" viewBox="0 0 200 200" fill="none">
          <defs>
            <linearGradient id={gp2} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
              <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.12" />
            </linearGradient>
          </defs>
          <path
            d="M45.7,-58.4C58.3,-49.6,66.5,-34.2,70.6,-17.7C74.7,-1.2,74.7,16.4,67.4,30.3C60.1,44.2,45.5,54.4,30.1,60.6C14.6,66.8,-1.7,69,-17.6,65.4C-33.5,61.8,-49,52.4,-59.1,38.7C-69.2,25,-73.9,7,-71.1,-9.4C-68.3,-25.8,-58,-40.6,-44.7,-49.6C-31.4,-58.6,-15.7,-61.8,0.9,-62.9C17.5,-64,35,-67.2,45.7,-58.4Z"
            transform="translate(100 100)"
            fill={`url(#${gp2})`}
            className="opacity-45"
          />
        </svg>

        <svg className="absolute -bottom-24 left-10 h-56 w-56 text-accent animate-float" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="86" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" />
          <circle cx="100" cy="100" r="62" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="6 10" />
        </svg>

        <svg className="absolute left-1/4 top-6 h-10 w-10 text-primary animate-floatSlow" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.35" transform="rotate(18 12 12)" />
        </svg>
        <svg className="absolute right-1/3 top-1/2 h-8 w-8 text-accent animate-float" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l2.6 5.6L21 9.4l-4.5 4.3 1.1 6.3L12 17l-5.6 3 1.1-6.3L3 9.4l6.4-.8L12 3z" fill="currentColor" fillOpacity="0.35" />
        </svg>
      </div>
    );
  }

  // hero — full richness
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {/* dot grid, fading to the right */}
      <svg className="absolute inset-y-0 right-0 hidden h-full w-2/3 text-primary sm:block" fill="none">
        <defs>
          <pattern id={dots} width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.8" fill="currentColor" fillOpacity="0.55" />
          </pattern>
          <linearGradient id={mask} x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="60%" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.25" />
          </linearGradient>
          <mask id={`m-${mask}`}>
            <rect width="100%" height="100%" fill={`url(#${mask})`} />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${dots})`} mask={`url(#m-${mask})`} className="opacity-45" />
      </svg>

      {/* top-right gradient blob */}
      <svg className="absolute -right-28 -top-32 h-[26rem] w-[26rem] text-primary" viewBox="0 0 200 200" fill="none">
        <defs>
          <linearGradient id={gp1} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.6" />
            <stop offset="55%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <path
          d="M45.7,-58.4C58.3,-49.6,66.5,-34.2,70.6,-17.7C74.7,-1.2,74.7,16.4,67.4,30.3C60.1,44.2,45.5,54.4,30.1,60.6C14.6,66.8,-1.7,69,-17.6,65.4C-33.5,61.8,-49,52.4,-59.1,38.7C-69.2,25,-73.9,7,-71.1,-9.4C-68.3,-25.8,-58,-40.6,-44.7,-49.6C-31.4,-58.6,-15.7,-61.8,0.9,-62.9C17.5,-64,35,-67.2,45.7,-58.4Z"
          transform="translate(100 100)"
          fill={`url(#${gp1})`}
          className="animate-floatSlow"
        />
      </svg>

      {/* bottom-left accent blob */}
      <svg className="absolute -bottom-32 -left-24 h-[22rem] w-[22rem] text-accent" viewBox="0 0 200 200" fill="none">
        <defs>
          <linearGradient id={gp2} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="100%" stopColor="rgb(var(--primary))" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <path
          d="M39.5,-51.8C50.4,-44.4,58,-31.9,62.4,-17.9C66.8,-3.9,68,11.7,62.4,24.3C56.8,36.9,44.5,46.6,31,52.9C17.5,59.3,2.9,62.4,-12.4,61C-27.7,59.6,-43.7,53.7,-53.6,42.2C-63.5,30.7,-67.3,13.6,-65.4,-2.3C-63.5,-18.2,-55.9,-32.9,-44.6,-40.7C-33.3,-48.5,-18.3,-49.4,-2.4,-46.3C13.5,-43.2,27,-51.8,39.5,-51.8Z"
          transform="translate(100 100)"
          fill={`url(#${gp2})`}
          className="animate-float"
        />
      </svg>

      {/* concentric rings */}
      <svg className="absolute right-16 top-16 h-64 w-64 text-primary" viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="92" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="68" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="5 10" />
        <circle cx="100" cy="100" r="44" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.5" />
      </svg>

      {/* floating accents */}
      <svg className="absolute left-[46%] top-10 h-9 w-9 text-primary animate-float" viewBox="0 0 24 24" fill="none">
        <path d="M12 2v20M2 12h20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.45" />
      </svg>
      <svg className="absolute right-[38%] bottom-16 h-7 w-7 text-accent animate-floatSlow" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.5" />
      </svg>
      <svg className="absolute left-[12%] top-24 h-8 w-8 text-accent animate-floatSlow" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.28" transform="rotate(20 12 12)" />
      </svg>
      <svg className="absolute bottom-10 left-[58%] h-10 w-10 text-primary animate-float" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l2.6 5.6L21 9.4l-4.5 4.3 1.1 6.3L12 17l-5.6 3 1.1-6.3L3 9.4l6.4-.8L12 3z" fill="currentColor" fillOpacity="0.35" />
      </svg>

      {/* bottom wave */}
      <svg
        className="absolute inset-x-0 bottom-0 h-24 w-full text-surface"
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M0,96 C180,150 360,30 540,54 C720,78 900,150 1080,120 C1260,90 1350,48 1440,72 L1440,160 L0,160 Z"
          fill="currentColor"
          fillOpacity="0.55"
        />
      </svg>
    </div>
  );
}

export default HeroDecor;
