import { motion } from "framer-motion";
import { RotateCw, Trophy, ScanLine, MousePointerClick, WifiOff } from "lucide-react";
import { SERVERS, type ProbeState } from "../lib/servers";
import { fmtMs, latencyTone } from "../lib/format";

interface ServerPanelProps {
  probes: Record<string, ProbeState>;
  bestId: string | null;
  selectedId: string;
  mode: "auto" | "manual";
  racing: boolean;
  metaCity?: string;
  metaColo?: string;
  onSelect: (id: string) => void;
  onRescan: () => void;
  onAuto: () => void;
}

function rank(p: ProbeState | undefined, idx: number): [number, number] {
  if (!p) return [3, idx];
  if (p.status === "done") return [0, p.avg ?? 9999];
  if (p.status === "measuring") return [1, idx];
  if (p.status === "queued") return [2, idx];
  return [3, idx];
}

export default function ServerPanel(props: ServerPanelProps) {
  const { probes, bestId, selectedId, mode, racing, metaCity, metaColo } = props;

  const ordered = SERVERS.map((s, i) => ({ s, i, p: probes[s.id] })).sort((a, b) => {
    const [ra, xa] = rank(a.p, a.i);
    const [rb, xb] = rank(b.p, b.i);
    return ra - rb || xa - xb;
  });

  return (
    <section className="glass rounded-3xl p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine size={13} className="text-cyan-300/80" />
          <h2 className="font-jbmono text-[10px] font-bold tracking-[0.24em] text-white/50">EDGE SERVERS</h2>
          {racing && <span className="anim-blink h-1.5 w-1.5 rounded-full bg-cyan-300" />}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={props.onAuto}
            title="Auto-select shortest path"
            className={`font-jbmono cursor-pointer rounded-full border px-2.5 py-1 text-[9px] font-bold tracking-[0.18em] transition-all ${
              mode === "auto"
                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-200"
                : "border-white/10 text-white/35 hover:text-white/70"
            }`}
          >
            AUTO
          </button>
          <button
            onClick={props.onRescan}
            title="Re-scan servers"
            className="cursor-pointer rounded-full border border-white/10 p-1.5 text-white/50 transition-all hover:border-white/25 hover:text-white"
          >
            <RotateCw size={12} className={racing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {ordered.map(({ s, p }) => {
          const isBest = bestId === s.id && !racing && p?.status === "done";
          const isSel = selectedId === s.id;
          const tone = latencyTone(p?.avg);
          return (
            <motion.button
              layout
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              key={s.id}
              onClick={() => props.onSelect(s.id)}
              className={`group relative w-full cursor-pointer overflow-hidden rounded-2xl border px-3.5 py-3 text-left transition-colors duration-300 ${
                isSel ? "border-white/25 bg-white/[0.055]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/15"
              }`}
              style={isBest ? { borderColor: `${s.accent}66`, boxShadow: `0 0 24px ${s.accent}14 inset` } : undefined}
            >
              {p?.status === "measuring" && (
                <div className="scanline pointer-events-none absolute inset-y-0 w-1/3 opacity-40" />
              )}

              <div className="flex items-center gap-3">
                {/* selection pip */}
                <span
                  className={`h-2 w-2 shrink-0 rounded-full transition-all duration-300 ${
                    isSel ? "scale-110" : "opacity-30 group-hover:opacity-60"
                  }`}
                  style={{ background: isSel ? s.accent : "#94a3b8", boxShadow: isSel ? `0 0 10px ${s.accent}` : "none" }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-white/90">{s.name}</span>
                    {isBest && (
                      <span
                        className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-[3px] font-jbmono text-[8px] font-bold tracking-[0.14em]"
                        style={{ background: `${s.accent}1f`, color: s.accent, border: `1px solid ${s.accent}44` }}
                      >
                        <Trophy size={8} /> SHORTEST
                      </span>
                    )}
                  </div>
                  <div className="truncate font-jbmono text-[9.5px] tracking-wide text-white/35">
                    {s.id === "cloudflare" && metaCity
                      ? `PoP ${metaCity.toUpperCase()} · ${metaColo ?? s.tag}`
                      : s.vendor.toUpperCase()}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  {p?.status === "done" ? (
                    <>
                      <div className="font-jbmono text-sm font-bold tabular" style={{ color: tone }}>
                        {fmtMs(p.avg)}
                        <span className="ml-0.5 text-[9px] font-medium text-white/35">ms</span>
                      </div>
                      <div className="font-jbmono text-[8.5px] tabular text-white/30">
                        ±{fmtMs(p.jitter)} jit
                      </div>
                    </>
                  ) : p?.status === "fail" ? (
                    <div className="flex items-center gap-1 font-jbmono text-[9px] font-bold tracking-widest text-rose-400/70">
                      <WifiOff size={10} /> TIMEOUT
                    </div>
                  ) : (
                    <div className="flex items-center gap-[3px] py-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-1 w-1 rounded-full bg-cyan-200/50"
                          style={{ animation: `blink 1.1s ${i * 0.18}s ease-in-out infinite` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* latency bar */}
              <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/[0.05]">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: tone }}
                  initial={false}
                  animate={{
                    width:
                      p?.status === "done" && p.avg != null
                        ? `${Math.max(6, Math.min(100, (1 - Math.min(p.avg, 400) / 400) * 100))}%`
                        : p?.status === "measuring"
                          ? "30%"
                          : "4%",
                  }}
                  transition={{ type: "spring", stiffness: 90, damping: 20 }}
                />
              </div>
            </motion.button>
          );
        })}
      </div>

      <p className="mt-4 flex items-start gap-1.5 font-jbmono text-[9px] leading-relaxed tracking-wide text-white/30">
        <MousePointerClick size={11} className="mt-[1px] shrink-0" />
        Round-trip probed live from your network. Fleet is sorted shortest-path first; the winner is auto-selected.
      </p>
    </section>
  );
}
