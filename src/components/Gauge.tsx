import type { ReactNode } from "react";
import type { Phase } from "../lib/engine";

const CX = 280;
const CY = 252;
const R = 200;
const A0 = 150;
const A1 = 390;
const MAXV = 1000;

const tOf = (v: number) => Math.min(1, Math.log10(1 + Math.max(0, v)) / Math.log10(1 + MAXV));
const angOf = (v: number) => A0 + tOf(v) * (A1 - A0);

const polar = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};

const arcPath = (v0: number, v1: number, r: number) => {
  const a0 = angOf(v0);
  const a1 = angOf(v1);
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(a1, r);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

const MAJORS: { v: number; label: string }[] = [
  { v: 0, label: "0" },
  { v: 1, label: "1" },
  { v: 2, label: "2" },
  { v: 5, label: "5" },
  { v: 10, label: "10" },
  { v: 20, label: "20" },
  { v: 50, label: "50" },
  { v: 100, label: "100" },
  { v: 200, label: "200" },
  { v: 500, label: "500" },
  { v: 1000, label: "1G" },
];
const MINORS = [0.5, 1.5, 3, 7, 15, 35, 75, 150, 350, 750];

export interface GaugeProps {
  value: number;
  accent: string;
  phase: Phase;
  norm: number;
  children?: ReactNode;
}

export default function Gauge({ value, accent, phase, norm, children }: GaugeProps) {
  const live = phase === "download" || phase === "upload" || phase === "done";
  const tip = live && value > 0.4 ? polar(angOf(value), R) : null;

  return (
    <div className="relative mx-auto w-full max-w-[600px]">
      {/* ambient glow behind the dial */}
      <div
        className="absolute left-1/2 top-[54%] h-[62%] w-[76%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px] transition-opacity duration-700"
        style={{ background: accent, opacity: 0.08 + norm * 0.16 }}
      />

      <svg viewBox="0 0 560 392" className="relative z-10 w-full" style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id="gaugeRad" cx="50%" cy="62%" r="65%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="70%" stopColor="#ffffff" stopOpacity="0.01" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={CX} cy={CY} r={R - 10} fill="url(#gaugeRad)" />

        {/* scale ticks */}
        {MINORS.map((v) => {
          const a = angOf(v);
          const [x0, y0] = polar(a, R - 20);
          const [x1, y1] = polar(a, R - 28);
          return <line key={`m${v}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgba(148,163,184,0.22)" strokeWidth={1.5} />;
        })}
        {MAJORS.map(({ v, label }) => {
          const a = angOf(v);
          const [x0, y0] = polar(a, R - 18);
          const [x1, y1] = polar(a, R - 36);
          const [lx, ly] = polar(a, R - 54);
          return (
            <g key={`M${v}`}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgba(226,232,240,0.34)" strokeWidth={2} strokeLinecap="round" />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(148,163,184,0.55)"
                fontSize={12}
                fontFamily="JetBrains Mono, monospace"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* track */}
        <path d={arcPath(0, MAXV, R)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={12} strokeLinecap="round" />

        {/* progress */}
        {tip && (
          <>
            <path
              d={arcPath(0, value, R)}
              fill="none"
              stroke={accent}
              strokeWidth={12}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 16px ${accent})` }}
            />
            <circle cx={tip[0]} cy={tip[1]} r={6.5} fill="#ffffff" style={{ filter: `drop-shadow(0 0 10px ${accent})` }} />
          </>
        )}

        {/* needle */}
        <g
          style={{
            transform: `rotate(${(live ? angOf(value) : A0) - 270}deg)`,
            transformBox: "view-box",
            transformOrigin: `${CX}px ${CY}px`,
            transition: "transform 180ms cubic-bezier(0.3, 0.9, 0.35, 1.15)",
          }}
        >
          <polygon
            points={`${CX},${CY - (R - 64)} ${CX - 4.5},${CY - 8} ${CX + 4.5},${CY - 8}`}
            fill="rgba(241,245,249,0.92)"
            className="needle-shadow"
            style={{ color: accent }}
          />
        </g>
        <circle cx={CX} cy={CY} r={13} fill="#0a0d18" stroke={accent} strokeOpacity={0.85} strokeWidth={2} />
        <circle cx={CX} cy={CY} r={4} fill={accent} />
      </svg>

      {/* center readout overlay */}
      <div
        className="pointer-events-none absolute z-20 flex w-full flex-col items-center pt-1"
        style={{ left: 0, top: "69%" }}
      >
        {children}
      </div>
    </div>
  );
}
