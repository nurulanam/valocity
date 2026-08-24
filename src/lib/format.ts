export function fmtSpeed(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1000) return (v / 1000).toFixed(2);
  if (v >= 100) return v.toFixed(1);
  if (v >= 10) return v.toFixed(2);
  if (v <= 0) return "0.00";
  return v.toFixed(2);
}

export function speedUnit(v: number | null | undefined): string {
  if (v != null && isFinite(v) && v >= 1000) return "Gbps";
  return "Mbps";
}

export function fmtMs(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + " KB";
  return bytes + " B";
}

export interface Grade {
  letter: string;
  label: string;
  color: string;
}

export function gradeFor(down: number): Grade {
  if (down >= 600) return { letter: "S", label: "Exceptional", color: "#e879f9" };
  if (down >= 350) return { letter: "A+", label: "Superb", color: "#a78bfa" };
  if (down >= 200) return { letter: "A", label: "Excellent", color: "#818cf8" };
  if (down >= 120) return { letter: "B+", label: "Very good", color: "#38bdf8" };
  if (down >= 60) return { letter: "B", label: "Good", color: "#22d3ee" };
  if (down >= 30) return { letter: "C+", label: "Fair", color: "#34d399" };
  if (down >= 15) return { letter: "C", label: "Average", color: "#a3e635" };
  if (down >= 5) return { letter: "D", label: "Slow", color: "#fbbf24" };
  return { letter: "E", label: "Poor", color: "#fb7185" };
}

export function latencyTone(ms: number | undefined): string {
  if (ms == undefined || !isFinite(ms)) return "#64748b";
  if (ms < 25) return "#34d399";
  if (ms < 60) return "#a3e635";
  if (ms < 120) return "#fbbf24";
  return "#fb7185";
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function mean(a: number[]): number {
  if (!a.length) return 0;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

export function trimmedMean(a: number[], trim = 0.1): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const k = Math.floor(s.length * trim);
  const core = s.slice(k, Math.max(k + 1, s.length - k));
  return mean(core);
}
