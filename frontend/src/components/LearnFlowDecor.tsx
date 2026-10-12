import type { ReactNode } from "react";

type Variant = "hero" | "soft";

/**
 * Animated learning-journey background: Live classes -> Diploma -> Certificate.
 * Purely presentational (pointer-events-none, aria-hidden, theme-aware colours).
 * The flow line, a travelling pulse and a looping reveal are driven by SVG SMIL,
 * so no CSS or JS timers are needed.
 */
export function LearnFlowDecor({ variant = "hero", className = "" }: { variant?: Variant; className?: string }) {
  const flowPath = "learn-flow-path";
  const compact = variant === "soft";

  const node = (x: number, y: number, label: string, sub: string, begin: string, children: ReactNode, key: string) => (
    <g key={key}>
      <animate attributeName="opacity" values="0;1;1;1;0" keyTimes="0;0.06;0.78;0.9;1" dur="10s" begin={begin} repeatCount="indefinite" />
      <circle cx={x} cy={y} r={44} fill="rgb(var(--primary))" fillOpacity="0.10" />
      <circle cx={x} cy={y} r={34} fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx={x} cy={y} r={26} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="3 6" />
      <g transform={`translate(${x - 13} ${y - 22})`} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {children}
      </g>
      <text x={x} y={y + 58} textAnchor="middle" className="font-bold" fontSize="14" fill="currentColor" fillOpacity="0.9">
        {label}
      </text>
      <text x={x} y={y + 76} textAnchor="middle" fontSize="11.5" fill="currentColor" fillOpacity="0.55">
        {sub}
      </text>
    </g>
  );

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {/* soft blobs (same language as the old hero decor) */}
      <svg className="absolute -right-24 -top-28 h-[24rem] w-[24rem] text-primary" viewBox="0 0 200 200" fill="none">
        <defs>
          <linearGradient id={`${flowPath}-g1`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <path
          d="M45.7,-58.4C58.3,-49.6,66.5,-34.2,70.6,-17.7C74.7,-1.2,74.7,16.4,67.4,30.3C60.1,44.2,45.5,54.4,30.1,60.6C14.6,66.8,-1.7,69,-17.6,65.4C-33.5,61.8,-49,52.4,-59.1,38.7C-69.2,25,-73.9,7,-71.1,-9.4C-68.3,-25.8,-58,-40.6,-44.7,-49.6C-31.4,-58.6,-15.7,-61.8,0.9,-62.9C17.5,-64,35,-67.2,45.7,-58.4Z"
          transform="translate(100 100)"
          fill={`url(#${flowPath}-g1)`}
          className="animate-floatSlow"
        />
      </svg>
      <svg className="absolute -bottom-24 left-4 h-[18rem] w-[18rem] text-primary" viewBox="0 0 200 200" fill="none">
        <defs>
          <linearGradient id={`${flowPath}-g2`} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(var(--primary2))" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <path
          d="M39.5,-51.8C50.4,-44.4,58,-31.9,62.4,-17.9C66.8,-3.9,68,11.7,62.4,24.3C56.8,36.9,44.5,46.6,31,52.9C17.5,59.3,2.9,62.4,-12.4,61C-27.7,59.6,-43.7,53.7,-53.6,42.2C-63.5,30.7,-67.3,13.6,-65.4,-2.3C-63.5,-18.2,-55.9,-32.9,-44.6,-40.7C-33.3,-48.5,-18.3,-49.4,-2.4,-46.3C13.5,-43.2,27.5,-51.8,39.5,-51.8Z"
          transform="translate(100 100)"
          fill={`url(#${flowPath}-g2)`}
          className="animate-float"
        />
      </svg>

      {/* the journey: classes -> diploma -> certificate */}
      <svg
        className={`absolute inset-y-0 right-0 h-full ${compact ? "w-[62%] opacity-90" : "w-[58%]"} text-primary`}
        viewBox="0 0 620 460"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* rings behind the certificate */}
        <g className="animate-floatSlow">
          <circle cx="520" cy="120" r="92" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.5" />
          <circle cx="520" cy="120" r="68" stroke="currentColor" strokeOpacity="0.13" strokeWidth="1.5" strokeDasharray="5 10" />
        </g>

        {/* guide line + moving dashes */}
        <path id={flowPath} d="M96 300 C 190 292, 230 232, 306 200 S 452 150, 520 120" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.5" strokeDasharray="8 12" fill="none">
          <animate attributeName="stroke-dashoffset" from="0" to="-200" dur="4s" repeatCount="indefinite" />
        </path>
        <path d="M96 300 C 190 292, 230 232, 306 200 S 452 150, 520 120" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2.5" strokeDasharray="26 380" fill="none" strokeLinecap="round">
          <animate attributeName="stroke-dashoffset" from="0" to="-406" dur="5s" repeatCount="indefinite" />
        </path>

        {/* travelling pulse along the path */}
        <circle r="12" fill="rgb(var(--accent))" fillOpacity="0.25">
          <animateMotion dur="5s" repeatCount="indefinite">
            <mpath xlinkHref={`#${flowPath}`} />
          </animateMotion>
          <animate attributeName="opacity" values="0;0.6;0.6;0" keyTimes="0;0.05;0.9;1" dur="5s" repeatCount="indefinite" />
        </circle>
        <circle r="6" fill="rgb(var(--accent))">
          <animateMotion dur="5s" repeatCount="indefinite">
            <mpath xlinkHref={`#${flowPath}`} />
          </animateMotion>
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.9;1" dur="5s" repeatCount="indefinite" />
        </circle>

        {/* stage 1: live classes */}
        {node(
          96,
          300,
          "Live classes",
          "Lessons, tutes & exams",
          "0s",
          <>
            <rect x="1" y="5" width="15" height="14" rx="2.5" />
            <path d="M16 10.5 L24 6.5 v11 L16 13.5 z" />
          </>,
          "stage-1"
        )}

        {/* stage 2: diploma */}
        {node(
          306,
          200,
          "Diploma",
          "Complete your programme",
          "1.1s",
          <>
            <path d="M13 4 L1 9.5 L13 15 L25 9.5 L13 4 Z" />
            <path d="M5 12.5 V17 c0 2 3.6 3.6 8 3.6 s8-1.6 8-3.6 v-4.5" />
            <path d="M23 10.5 V16" />
          </>,
          "stage-2"
        )}

        {/* stage 3: certificate */}
        <g>
          <animate attributeName="opacity" values="0;0;1;1;1;0" keyTimes="0;0.16;0.26;0.8;0.9;1" dur="10s" begin="2.2s" repeatCount="indefinite" />
          <circle cx="520" cy="120" r="44" fill="rgb(var(--accent))" fillOpacity="0.12" />
          <circle cx="520" cy="120" r="34" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
          <circle cx="520" cy="120" r="26" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" strokeDasharray="3 6" />
          <g transform="translate(506 97)">
            <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <rect x="1" y="2" width="24" height="16" rx="2.5" />
              <path d="M5.5 7h9M5.5 11h6" />
              <circle cx="20" cy="19" r="4.4" />
              <path d="M18.2 22.6 L17.6 27 l2.4-1.2 2.4 1.2 -.6-4.4" />
            </g>
            <animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="2.4s" repeatCount="indefinite" additive="sum" />
          </g>
          <text x="520" y="178" textAnchor="middle" className="font-bold" fontSize="14" fill="currentColor" fillOpacity="0.9">
            Certificate
          </text>
          <text x="520" y="196" textAnchor="middle" fontSize="11.5" fill="currentColor" fillOpacity="0.55">
            QR verified & shareable
          </text>
        </g>

        {/* small floating accents */}
        <path d="M180 96 v14 M173 103 h14" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.35" className="animate-float" />
        <circle cx="420" cy="330" r="7" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" className="animate-floatSlow" />
        <path d="M600 250 l3 6.4 6.7.9 -4.8 4.6 1.1 6.6 -6-3 -6 3 1.1-6.6 -4.8-4.6 6.7-.9 z" fill="currentColor" fillOpacity="0.25" className="animate-float" />
      </svg>
    </div>
  );
}

export default LearnFlowDecor;
