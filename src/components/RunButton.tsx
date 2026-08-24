import { Square } from "lucide-react";
import type { Phase } from "../lib/engine";

interface RunButtonProps {
  running: boolean;
  phase: Phase;
  progress: number;
  accent: string;
  onClick: () => void;
}

const R = 44;
const C = 2 * Math.PI * R;

const PHASE_SHORT: Partial<Record<Phase, string>> = {
  latency: "PING",
  download: "DOWN",
  upload: "UP",
};

export default function RunButton({ running, phase, progress, accent, onClick }: RunButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={running ? "Cancel speed test" : "Start speed test"}
      className="group relative h-28 w-28 cursor-pointer rounded-full outline-none transition-transform duration-200 hover:scale-[1.045] active:scale-[0.96]"
    >
      {/* rotating conic halo while running */}
      {running && (
        <>
          <div
            className="anim-spin-slow absolute -inset-1.5 rounded-full opacity-60 blur-[6px]"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg 260deg, ${accent} 320deg, transparent 360deg)`,
            }}
          />
          <div
            className="anim-ping-ring absolute inset-0 rounded-full border"
            style={{ borderColor: `${accent}55` }}
          />
        </>
      )}

      {/* progress ring */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
        {running && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={accent}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - Math.min(1, Math.max(0, progress)))}
            style={{ transition: "stroke-dashoffset 200ms linear", filter: `drop-shadow(0 0 6px ${accent})` }}
          />
        )}
      </svg>

      {/* core */}
      <div
        className={`absolute inset-[9px] flex flex-col items-center justify-center rounded-full border transition-colors duration-300 ${
          running ? "glass" : "glass-hot shadow-[0_0_45px_rgba(34,211,238,0.25)]"
        }`}
        style={running ? { borderColor: `${accent}44` } : undefined}
      >
        {running ? (
          <>
            <Square size={17} className="mb-1" style={{ color: accent }} fill="currentColor" />
            <span className="font-jbmono text-sm font-bold tabular text-white">
              {Math.round(progress * 100)}
              <span className="text-[10px] text-white/50">%</span>
            </span>
            <span className="font-jbmono text-[8px] font-semibold tracking-[0.22em]" style={{ color: accent }}>
              {PHASE_SHORT[phase] ?? "…"}
            </span>
          </>
        ) : (
          <>
            <span className="text-[26px] font-bold tracking-[0.14em] text-white drop-shadow-[0_0_18px_rgba(34,211,238,0.55)]">
              GO
            </span>
            <span className="font-jbmono text-[8px] font-medium tracking-[0.3em] text-cyan-200/60">START</span>
          </>
        )}
      </div>
    </button>
  );
}
