import type { ReactNode } from "react";

type Variant = "hero" | "soft";

/**
 * Animated app-workflow background (curved journeys, not straight lines).
 * Student journey: Start learning (Classes/Courses/Diploma) -> Complete -> Certificate -> Verify
 * Counselling journey: Pick counsellor -> Book session -> Attend session
 * Bezier guide paths, flowing dashes, glowing travelling pulses, staggered 10s reveal.
 */
export function LearnFlowDecor({ variant = "hero", className = "" }: { variant?: Variant; className?: string }) {
  const id = "learn-flow";
  const compact = variant === "soft";

  const node = (x: number, y: number, label: string, sub: string, begin: string, children: ReactNode, key: string, accent = false) => (
    <g key={key}>
      <animate attributeName="opacity" values="0;1;1;1;0" keyTimes="0;0.05;0.72;0.9;1" dur="10s" begin={begin} repeatCount="indefinite" />
      <circle cx={x} cy={y} r={42} fill={accent ? "rgb(var(--accent))" : "rgb(var(--primary))"} fillOpacity={accent ? "0.16" : "0.12"} />
      <circle cx={x} cy={y} r={32} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
      <circle cx={x} cy={y} r={24} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="3 7" />
      <circle cx={x + 28} cy={y - 28} r={2.6} fill="rgb(var(--accent))" fillOpacity="0.8" />
      <g transform={`translate(${x - 13} ${y - 21})`} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {children}
      </g>
      <text x={x} y={y + 62} textAnchor="middle" className="font-bold" fontSize="13.5" fill="currentColor" fillOpacity="0.95">
        {label}
      </text>
      <text x={x} y={y + 79} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
        {sub}
      </text>
    </g>
  );

  const pulse = (pathId: string, dur: string, begin: string, key: string) => (
    <g key={key}>
      <circle r="15" fill="rgb(var(--accent))" fillOpacity="0.3">
        <animateMotion dur={dur} begin={begin} repeatCount="indefinite">
          <mpath xlinkHref={`#${pathId}`} />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.7;0.7;0" keyTimes="0;0.05;0.9;1" dur={dur} begin={begin} repeatCount="indefinite" />
      </circle>
      <circle r="7" fill="rgb(var(--accent))">
        <animateMotion dur={dur} begin={begin} repeatCount="indefinite">
          <mpath xlinkHref={`#${pathId}`} />
        </animateMotion>
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.9;1" dur={dur} begin={begin} repeatCount="indefinite" />
      </circle>
      <circle r="2.5" fill="#fff" fillOpacity="0.9">
        <animateMotion dur={dur} begin={begin} repeatCount="indefinite">
          <mpath xlinkHref={`#${pathId}`} />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.05;0.9;1" dur={dur} begin={begin} repeatCount="indefinite" />
      </circle>
    </g>
  );

  const caption = (x: number, y: number, text: string, begin: string, key: string) => (
    <text key={key} x={x} y={y} className="font-bold" fontSize="11.5" letterSpacing="2.2" fill="currentColor" fillOpacity="0.5">
      {text}
      <animate attributeName="opacity" values="0;0.45;0.45;0.45;0" keyTimes="0;0.05;0.72;0.9;1" dur="10s" begin={begin} repeatCount="indefinite" />
    </text>
  );

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden text-white ${className}`} aria-hidden="true">
      {/* soft blobs */}
      <svg className="absolute -right-24 -top-28 h-[24rem] w-[24rem] text-primary" viewBox="0 0 200 200" fill="none">
        <defs>
          <linearGradient id={`${id}-g1`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <path
          d="M45.7,-58.4C58.3,-49.6,66.5,-34.2,70.6,-17.7C74.7,-1.2,74.7,16.4,67.4,30.3C60.1,44.2,45.5,54.4,30.1,60.6C14.6,66.8,-1.7,69,-17.6,65.4C-33.5,61.8,-49,52.4,-59.1,38.7C-69.2,25,-73.9,7,-71.1,-9.4C-68.3,-25.8,-58,-40.6,-44.7,-49.6C-31.4,-58.6,-15.7,-61.8,0.9,-62.9C17.5,-64,35,-67.2,45.7,-58.4Z"
          transform="translate(100 100)"
          fill={`url(#${id}-g1)`}
          className="animate-floatSlow"
        />
      </svg>
      <svg className="absolute -bottom-24 left-4 h-[18rem] w-[18rem] text-primary" viewBox="0 0 200 200" fill="none">
        <defs>
          <linearGradient id={`${id}-g2`} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(var(--primary2))" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <path
          d="M39.5,-51.8C50.4,-44.4,58,-31.9,62.4,-17.9C66.8,-3.9,68,11.7,62.4,24.3C56.8,36.9,44.5,46.6,31,52.9C17.5,59.3,2.9,62.4,-12.4,61C-27.7,59.6,-43.7,53.7,-53.6,42.2C-63.5,30.7,-67.3,13.6,-65.4,-2.3C-63.5,-18.2,-55.9,-32.9,-44.6,-40.7C-33.3,-48.5,-18.3,-49.4,-2.4,-46.3C13.5,-43.2,27.5,-51.8,39.5,-51.8Z"
          transform="translate(100 100)"
          fill={`url(#${id}-g2)`}
          className="animate-float"
        />
      </svg>

      <svg
        className={`absolute inset-y-0 right-0 h-full ${compact ? "w-full opacity-90" : "w-full lg:w-[52%]"}`}
        viewBox="0 0 900 560"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={`${id}-stroke-a`} x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.6" />
            <stop offset="55%" stopColor="rgb(var(--primary2))" stopOpacity="0.75" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id={`${id}-stroke-b`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
            <stop offset="100%" stopColor="rgb(var(--primary2))" stopOpacity="0.7" />
          </linearGradient>
          <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 1 L9 5 L0 9 z" fill="currentColor" fillOpacity="0.5" />
          </marker>
        </defs>

        {/* gentle drift of the whole scene */}
        <g>
          <animateTransform attributeName="transform" type="translate" values="0 0; 0 -7; 0 0" dur="9s" repeatCount="indefinite" />

          {/* faint hand-off into counselling */}
          <path d="M110 352 C 108 398, 118 430, 148 442" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="4 9" fill="none" />

          {/* --- student journey: winding curve --- */}
          <path
            id={`${id}-a`}
            d="M110 320 C185 292 215 205 315 175 C420 143 455 128 545 138 C650 150 705 175 785 210"
            stroke={`url(#${id}-stroke-a)`}
            strokeWidth="3"
            strokeDasharray="10 14"
            strokeLinecap="round"
            fill="none"
            markerEnd={`url(#${id}-arrow)`}
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-240" dur="4.5s" repeatCount="indefinite" />
          </path>
          {pulse(`${id}-a`, "5.5s", "0s", "pulse-a")}

          {/* --- counselling journey: lazy S-curve --- */}
          <path
            id={`${id}-b`}
            d="M155 452 C260 420 350 500 455 478 C570 454 665 415 765 438"
            stroke={`url(#${id}-stroke-b)`}
            strokeWidth="3"
            strokeDasharray="10 14"
            strokeLinecap="round"
            fill="none"
            markerEnd={`url(#${id}-arrow)`}
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-240" dur="5s" begin="1.2s" repeatCount="indefinite" />
          </path>
          {pulse(`${id}-b`, "6.5s", "1.2s", "pulse-b")}

          {/* captions */}
          {caption(110, 258, "STUDENT JOURNEY", "0s", "cap-a")}
          {caption(155, 392, "COUNSELLING", "3.4s", "cap-b")}

          {/* student journey nodes */}
          {node(
            110,
            320,
            "Start learning",
            "Classes · Courses · Diploma",
            "0s",
            <>
              <path d="M12 6.5C10 4.8 7 4.5 3 5v14c4-.5 7-.2 9 1.5 2-1.7 5-2 9-1.5V5c-4-.5-7-.2-9 1.5Z" />
              <path d="M12 6.5v14" />
            </>,
            "a1"
          )}
          {node(
            315,
            175,
            "Complete",
            "Finish programme & results",
            "0.9s",
            <>
              <circle cx="13" cy="13" r="10" />
              <path d="M8 13.5l3.5 3.5L19 9" />
            </>,
            "a2"
          )}
          {/* certificate (pulsing seal) */}
          <g>
            <animate attributeName="opacity" values="0;1;1;1;0" keyTimes="0;0.05;0.72;0.9;1" dur="10s" begin="1.8s" repeatCount="indefinite" />
            <g transform="translate(545 138)">
              <animateTransform attributeName="transform" type="scale" values="1;1.07;1" dur="2.4s" repeatCount="indefinite" additive="sum" />
              <circle cx="0" cy="0" r="42" fill="rgb(var(--accent))" fillOpacity="0.16" />
              <circle cx="0" cy="0" r="32" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="24" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="3 7" />
              <circle cx="28" cy="-28" r="2.6" fill="rgb(var(--accent))" fillOpacity="0.8" />
              <g transform="translate(-13 -21)" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none">
                <rect x="1" y="2" width="24" height="16" rx="2.5" />
                <path d="M5.5 7h9M5.5 11h6" />
                <circle cx="20" cy="19" r="4.4" />
                <path d="M18.2 22.6L17.6 27l2.4-1.2 2.4 1.2-.6-4.4" />
              </g>
              <text x="0" y="62" textAnchor="middle" className="font-bold" fontSize="13.5" fill="currentColor" fillOpacity="0.95">
                Certificate
              </text>
              <text x="0" y="79" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                QR-stamped PDF issued
              </text>
            </g>
          </g>
          {node(
            785,
            210,
            "Verify",
            "Anyone checks it online",
            "2.6s",
            <>
              <circle cx="11" cy="11" r="7.5" />
              <path d="M16.5 16.5 22.5 22.5" />
              <path d="M7.5 11l2.8 2.8 5.2-5.2" />
            </>,
            "a4",
            true
          )}

          {/* counselling journey nodes */}
          {node(
            155,
            452,
            "Pick counsellor",
            "Browse & choose an expert",
            "3.4s",
            <>
              <circle cx="13" cy="8.5" r="5" />
              <path d="M4 22.5a9 9 0 0 1 18 0" />
            </>,
            "b1"
          )}
          {node(
            455,
            478,
            "Book session",
            "Pick a free time slot",
            "4.2s",
            <>
              <rect x="2" y="4.5" width="22" height="18" rx="2.5" />
              <path d="M2 10h22M7 2.5v4M19 2.5v4" />
              <rect x="8" y="14" width="3.5" height="3.5" rx="0.5" />
            </>,
            "b2"
          )}
          {node(
            765,
            438,
            "Attend session",
            "Online video or at the centre",
            "5s",
            <>
              <rect x="1" y="6" width="15" height="13" rx="2.5" />
              <path d="M16 11.5 25 7v12l-9-4.5z" />
            </>,
            "b3",
            true
          )}

          {/* floating accents */}
          <path d="M420 280 v14 M413 287 h14" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.4" className="animate-float" />
          <circle cx="660" cy="330" r="7" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.35" className="animate-floatSlow" />
          <path d="M860 120 l3 6.4 6.7.9 -4.8 4.6 1.1 6.6 -6-3 -6 3 1.1-6.6 -4.8-4.6 6.7-.9 z" fill="currentColor" fillOpacity="0.3" className="animate-float" />
        </g>
      </svg>
    </div>
  );
}

export default LearnFlowDecor;
