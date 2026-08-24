import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownToLine, ArrowUpFromLine, Activity, BadgeCheck, Check, Copy, RotateCcw, Waves } from "lucide-react";
import { fmtMs, fmtSpeed, speedUnit, gradeFor, fmtBytes, clockTime } from "../lib/format";

export interface TestResult {
  ping: number;
  jitter: number;
  latency: number;
  down: number;
  up: number;
  downPeak: number;
  upPeak: number;
  downBytes: number;
  upBytes: number;
  at: number;
}

interface ResultsPanelProps {
  result: TestResult;
  serverName: string;
  edgeLine: string;
  onRetest: () => void;
}

export default function ResultsPanel({ result, serverName, edgeLine, onRetest }: ResultsPanelProps) {
  const [copied, setCopied] = useState(false);
  const grade = gradeFor(result.down);

  const copyReport = async () => {
    const report = [
      "VELOCITY — Broadband Speed Report",
      `Grade        ${grade.letter} (${grade.label})`,
      `Download     ${fmtSpeed(result.down)} ${speedUnit(result.down)}  (peak ${fmtSpeed(result.downPeak)} ${speedUnit(result.downPeak)})`,
      `Upload       ${fmtSpeed(result.up)} ${speedUnit(result.up)}  (peak ${fmtSpeed(result.upPeak)} ${speedUnit(result.upPeak)})`,
      `Ping         ${fmtMs(result.ping)} ms   Jitter ${fmtMs(result.jitter)} ms   Avg RTT ${fmtMs(result.latency)} ms`,
      `Server       ${serverName}${edgeLine ? ` — ${edgeLine}` : ""}`,
      `Data moved   ${fmtBytes(result.downBytes)} down / ${fmtBytes(result.upBytes)} up`,
      `Time         ${new Date(result.at).toISOString()}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  const blocks = [
    {
      icon: ArrowDownToLine,
      label: "DOWNLOAD",
      accent: "#22d3ee",
      value: fmtSpeed(result.down),
      unit: speedUnit(result.down),
      sub: `peak ${fmtSpeed(result.downPeak)} · ${fmtBytes(result.downBytes)}`,
      bar: Math.min(1, result.down / 1000),
    },
    {
      icon: ArrowUpFromLine,
      label: "UPLOAD",
      accent: "#f472b6",
      value: fmtSpeed(result.up),
      unit: speedUnit(result.up),
      sub: `peak ${fmtSpeed(result.upPeak)} · ${fmtBytes(result.upBytes)}`,
      bar: Math.min(1, result.up / 250),
    },
    {
      icon: Activity,
      label: "PING",
      accent: "#a78bfa",
      value: fmtMs(result.ping),
      unit: "ms",
      sub: `avg rtt ${fmtMs(result.latency)} ms`,
      bar: Math.max(0.04, 1 - Math.min(result.ping, 200) / 200),
    },
    {
      icon: Waves,
      label: "JITTER",
      accent: "#fbbf24",
      value: fmtMs(result.jitter),
      unit: "ms",
      sub: result.jitter < 5 ? "rock steady" : result.jitter < 15 ? "stable" : "variable",
      bar: Math.max(0.04, 1 - Math.min(result.jitter, 40) / 40),
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 26, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.995 }}
      transition={{ type: "spring", stiffness: 90, damping: 18 }}
      className="glass relative mt-6 overflow-hidden rounded-3xl p-5 md:p-7"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${grade.color}88, transparent)` }}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <BadgeCheck size={15} style={{ color: grade.color }} />
        <h2 className="font-jbmono text-[10px] font-bold tracking-[0.26em] text-white/60">TEST COMPLETE</h2>
        <span className="font-jbmono text-[9px] tracking-[0.18em] text-white/30">
          {serverName.toUpperCase()}
          {edgeLine ? ` — ${edgeLine.toUpperCase()}` : ""}
        </span>
        <span className="ml-auto font-jbmono text-[9px] tracking-[0.18em] text-white/30">{clockTime(result.at)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {blocks.map((b) => (
          <div key={b.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="mb-2.5 flex items-center gap-1.5">
              <b.icon size={11} style={{ color: b.accent }} />
              <span className="font-jbmono text-[8.5px] font-bold tracking-[0.22em] text-white/40">{b.label}</span>
            </div>
            <div className="font-jbmono text-[26px] font-bold leading-none tabular text-white">
              {b.value}
              <span className="ml-1 text-[10px] font-medium text-white/35">{b.unit}</span>
            </div>
            <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: b.accent, boxShadow: `0 0 8px ${b.accent}` }}
                initial={{ width: 0 }}
                animate={{ width: `${b.bar * 100}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.15 }}
              />
            </div>
            <div className="mt-2 truncate font-jbmono text-[8.5px] tracking-wide text-white/30">{b.sub}</div>
          </div>
        ))}

        {/* grade */}
        <div className="relative col-span-2 flex items-center justify-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 lg:col-span-1">
          <div className="relative h-[86px] w-[86px]">
            <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
              <circle cx="48" cy="48" r="41" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
              <motion.circle
                cx="48"
                cy="48"
                r="41"
                fill="none"
                stroke={grade.color}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 41}
                initial={{ strokeDashoffset: 2 * Math.PI * 41 }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 1.1, ease: [0.3, 0.9, 0.3, 1], delay: 0.2 }}
                style={{ filter: `drop-shadow(0 0 8px ${grade.color})` }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[26px] font-bold" style={{ color: grade.color }}>
                {grade.letter}
              </span>
            </div>
          </div>
          <div>
            <div className="font-jbmono text-[8.5px] font-bold tracking-[0.24em] text-white/40">LINE GRADE</div>
            <div className="text-sm font-semibold text-white/85">{grade.label}</div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <button
          onClick={copyReport}
          className="glass-hot flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 font-jbmono text-[10px] font-bold tracking-[0.18em] text-cyan-100 transition-transform hover:scale-[1.03] active:scale-[0.97]"
        >
          {copied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
          {copied ? "COPIED" : "COPY REPORT"}
        </button>
        <button
          onClick={onRetest}
          className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 px-4 py-2 font-jbmono text-[10px] font-bold tracking-[0.18em] text-white/60 transition-all hover:border-white/30 hover:text-white active:scale-[0.97]"
        >
          <RotateCcw size={12} /> RETEST
        </button>
        <span className="ml-auto hidden font-jbmono text-[9px] tracking-[0.14em] text-white/25 md:block">
          MEASURED VIA NEAREST EDGE PoP · TRIMMED-MEAN AGGREGATION
        </span>
      </div>
    </motion.section>
  );
}
