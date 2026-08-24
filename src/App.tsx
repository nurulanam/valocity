import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronRight,
  Globe2,
  Radio,
  TriangleAlert,
  Waves,
  Zap,
} from "lucide-react";
import Backdrop from "./components/Backdrop";
import Gauge from "./components/Gauge";
import LiveChart, { type ChartPoint } from "./components/LiveChart";
import RunButton from "./components/RunButton";
import ServerPanel from "./components/ServerPanel";
import { ConnectionCard, MetricTile } from "./components/InfoPanel";
import ResultsPanel, { type TestResult } from "./components/ResultsPanel";
import HistoryPanel, { type HistoryItem } from "./components/HistoryPanel";
import {
  fetchMeta,
  measureDownload,
  measureLatency,
  measureUpload,
  type LatencyResult,
  type MetaInfo,
  type Phase,
  type SpeedResult,
} from "./lib/engine";
import { initialProbes, raceServers, SERVERS, type ProbeState } from "./lib/servers";
import { fmtMs, fmtSpeed, speedUnit, mean } from "./lib/format";

const ACCENT: Record<Phase, string> = {
  idle: "#38bdf8",
  racing: "#38bdf8",
  latency: "#a78bfa",
  download: "#22d3ee",
  upload: "#f472b6",
  done: "#34d399",
  error: "#fb7185",
};

const STEPS: { id: "latency" | "download" | "upload"; label: string }[] = [
  { id: "latency", label: "LATENCY" },
  { id: "download", label: "DOWNLOAD" },
  { id: "upload", label: "UPLOAD" },
];
const STEP_ORDER = ["idle", "latency", "download", "upload", "done"];

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem("velocity-history");
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [probes, setProbes] = useState<Record<string, ProbeState>>(initialProbes);
  const [bestId, setBestId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("cloudflare");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [racing, setRacing] = useState(true);

  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [latR, setLatR] = useState<LatencyResult | null>(null);
  const [downR, setDownR] = useState<SpeedResult | null>(null);
  const [upR, setUpR] = useState<SpeedResult | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);

  const chartRef = useRef<ChartPoint[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const raceAbortRef = useRef<AbortController | null>(null);
  const bootedRef = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const running = phase === "latency" || phase === "download" || phase === "upload";
  const accent = ACCENT[phase];

  // ---- server race -------------------------------------------------------
  const runRace = async () => {
    raceAbortRef.current?.abort();
    const ac = new AbortController();
    raceAbortRef.current = ac;
    setRacing(true);
    setBestId(null);
    setProbes(initialProbes());
    try {
      const { bestId: best } = await raceServers((p) => setProbes((prev) => ({ ...prev, [p.id]: p })), ac.signal);
      if (ac.signal.aborted) return;
      setBestId(best);
      if (best && modeRef.current === "auto") setSelectedId(best);
    } catch {
      /* network scan failed — keep defaults */
    } finally {
      if (!ac.signal.aborted) setRacing(false);
    }
  };

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    fetchMeta().then((m) => {
      setMeta(m);
      setMetaLoaded(true);
    });
    runRace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- the speed test ----------------------------------------------------
  const runTest = async () => {
    const ac = new AbortController();
    abortRef.current = ac;
    setError(null);
    setResult(null);
    setLatR(null);
    setDownR(null);
    setUpR(null);
    setLive(0);
    setProgress(0);
    chartRef.current.length = 0;
    const startedAt = Date.now();

    try {
      setPhase("latency");
      const l = await measureLatency(ac.signal, (_ms, samples) => {
        setLive(mean(samples.slice(-3)));
        setProgress(samples.length / 10);
      });
      setLatR(l);

      setPhase("download");
      setLive(0);
      setProgress(0);
      const d = await measureDownload(ac.signal, (mbps, _bytes, t) => {
        setLive(mbps);
        setProgress(Math.min(1, t / 10000));
        chartRef.current.push({ t: performance.now(), v: mbps, phase: "download" });
      });
      setDownR(d);

      setPhase("upload");
      setLive(0);
      setProgress(0);
      const u = await measureUpload(ac.signal, (mbps, _bytes, t) => {
        setLive(mbps);
        setProgress(Math.min(1, t / 9000));
        chartRef.current.push({ t: performance.now(), v: mbps, phase: "upload" });
      });
      setUpR(u);

      const res: TestResult = {
        ping: l.ping,
        jitter: l.jitter,
        latency: l.latency,
        down: d.mbps,
        up: u.mbps,
        downPeak: d.peak,
        upPeak: u.peak,
        downBytes: d.bytes,
        upBytes: u.bytes,
        at: startedAt,
      };
      setResult(res);
      setPhase("done");
      setProgress(1);
      setLive(res.down);
      const item: HistoryItem = { ts: startedAt, down: res.down, up: res.up, ping: res.ping };
      setHistory((h) => {
        const next = [item, ...h].slice(0, 12);
        try {
          localStorage.setItem("velocity-history", JSON.stringify(next));
        } catch {
          /* private mode */
        }
        return next;
      });
    } catch (e) {
      if ((e as DOMException).name === "AbortError") {
        setPhase("idle");
        setLive(0);
        setProgress(0);
      } else {
        setPhase("error");
        setError((e as Error).message || "The test could not be completed.");
      }
    }
  };

  const toggle = () => {
    if (running) {
      abortRef.current?.abort();
      return;
    }
    runTest();
  };

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        toggleRef.current();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ---- derived display values -------------------------------------------
  const server = SERVERS.find((s) => s.id === selectedId) ?? SERVERS[0];
  const edgeLine = meta?.city ? `${meta.city}${meta.colo ? ` · ${meta.colo}` : ""}` : (meta?.colo ?? "");

  const gaugeValue = phase === "download" || phase === "upload" ? live : phase === "done" ? (result?.down ?? 0) : 0;
  const norm = useMemo(() => Math.min(1, Math.log10(1 + Math.max(0, gaugeValue)) / Math.log10(1001)), [gaugeValue]);

  const center = (() => {
    const chip = (label: string) => (
      <div
        className="mb-2 flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-jbmono text-[8.5px] font-bold tracking-[0.24em]"
        style={{ borderColor: `${accent}44`, color: accent, background: `${accent}0f` }}
      >
        <span className={`h-1 w-1 rounded-full ${running ? "anim-blink" : ""}`} style={{ background: accent }} />
        {label}
      </div>
    );

    let value = "0.00";
    let unit = "Mbps";
    let label = racing ? "SCANNING SERVERS" : "STANDBY";
    let dim = true;

    switch (phase) {
      case "latency":
        value = fmtMs(live);
        unit = "ms";
        label = "ROUND TRIP";
        dim = false;
        break;
      case "download":
        value = fmtSpeed(live);
        unit = speedUnit(live);
        label = "DOWNLOADING";
        dim = false;
        break;
      case "upload":
        value = fmtSpeed(live);
        unit = speedUnit(live);
        label = "UPLOADING";
        dim = false;
        break;
      case "done":
        value = fmtSpeed(result?.down);
        unit = speedUnit(result?.down);
        label = "DOWNLOAD SPEED";
        dim = false;
        break;
      case "error":
        value = "ERR";
        unit = "";
        label = "TEST FAILED";
        break;
      default:
        break;
    }

    return (
      <>
        {chip(label)}
        <div
          className={`font-jbmono text-[40px] font-bold leading-none tabular tracking-tight sm:text-[52px] md:text-[64px] ${
            dim ? "text-white/20" : "text-white"
          }`}
          style={dim ? undefined : { textShadow: `0 0 34px ${accent}66` }}
        >
          {value}
          {unit && <span className="ml-2 text-[13px] font-medium tracking-wider text-white/40">{unit}</span>}
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 font-jbmono text-[9px] tracking-[0.18em] text-white/35">
          <Radio size={10} style={{ color: server.accent }} />
          {server.name.toUpperCase()}
          {edgeLine ? ` · ${edgeLine.toUpperCase()}` : ""}
        </div>
      </>
    );
  })();

  const stepState = (id: string) => {
    const cur = STEP_ORDER.indexOf(phase);
    const idx = STEP_ORDER.indexOf(id);
    if (phase === "error" || phase === "idle") return "pending";
    if (idx < cur) return "done";
    if (idx === cur) return "active";
    return "pending";
  };

  return (
    <div className="noise relative min-h-screen">
      <Backdrop />

      <div className="relative z-10 mx-auto max-w-[1520px] px-4 pb-14 md:px-8">
        {/* header */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-fuchsia-500 shadow-[0_0_28px_rgba(34,211,238,0.35)]">
              <Zap size={18} fill="#04050c" className="text-[#04050c]" />
            </div>
            <div>
              <div className="text-[17px] font-bold tracking-[0.24em] text-white">VELOCITY</div>
              <div className="font-jbmono text-[8.5px] font-medium tracking-[0.3em] text-white/35">
                BROADBAND SPEED INTELLIGENCE
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="glass hidden items-center gap-2 rounded-full px-3.5 py-2 sm:flex">
              <Globe2 size={12} className="text-cyan-300/80" />
              <span className="font-jbmono text-[9px] font-bold tracking-[0.18em] text-white/60">
                EDGE {meta?.colo ?? "···"}
              </span>
            </div>
            <div className="glass flex items-center gap-2 rounded-full px-3.5 py-2">
              <span className={`h-1.5 w-1.5 rounded-full ${racing ? "anim-blink bg-amber-300" : "bg-emerald-400"}`} />
              <span className="font-jbmono text-[9px] font-bold tracking-[0.18em] text-white/60">
                {racing ? "SCANNING" : `${SERVERS.length} SERVERS`}
              </span>
            </div>
          </div>
        </header>

        {/* main grid */}
        <main className="mt-2 grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
          {/* left — servers */}
          <div className="order-2 lg:order-1">
            <ServerPanel
              probes={probes}
              bestId={bestId}
              selectedId={selectedId}
              mode={mode}
              racing={racing}
              metaCity={meta?.city}
              metaColo={meta?.colo}
              onSelect={(id) => {
                setSelectedId(id);
                setMode("manual");
              }}
              onAuto={() => {
                setMode("auto");
                if (bestId) setSelectedId(bestId);
                else runRace();
              }}
              onRescan={runRace}
            />
          </div>

          {/* center — gauge */}
          <div className="order-1 lg:order-2">
            <div className="relative">
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[110px] transition-all duration-1000"
                style={{ background: accent, opacity: 0.05 + norm * 0.1 }}
              />
              <Gauge value={gaugeValue} accent={accent} phase={phase} norm={norm}>
                {center}
              </Gauge>
            </div>

            {/* stepper + run button */}
            <div className="relative z-20 mt-8 lg:mt-6 flex flex-col items-center gap-4">
              <div className="flex flex-wrap items-center justify-center gap-1.5 px-2">
                {STEPS.map((s, i) => {
                  const st = stepState(s.id);
                  const c = ACCENT[s.id];
                  return (
                    <div key={s.id} className="flex items-center gap-1.5">
                      {i > 0 && <ChevronRight size={10} className="text-white/20" />}
                      <span
                        className={`rounded-full border px-2.5 py-1 font-jbmono text-[8px] font-bold tracking-[0.2em] transition-all duration-300 ${
                          st === "done" ? "text-white/25" : st === "active" ? "" : "text-white/25"
                        }`}
                        style={
                          st === "active"
                            ? { borderColor: `${c}55`, color: c, background: `${c}10` }
                            : st === "done"
                              ? { borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.28)" }
                              : { borderColor: "rgba(255,255,255,0.07)" }
                        }
                      >
                        {st === "done" ? (
                          <span className="flex items-center gap-1">
                            <Check size={9} /> {s.label}
                          </span>
                        ) : (
                          s.label
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <RunButton running={running} phase={phase} progress={progress} accent={accent} onClick={toggle} />
            </div>

            {/* live chart */}
            <div className="glass relative mt-4 h-36 overflow-hidden rounded-3xl">
              <div className="absolute left-4 top-3 z-10 flex items-center gap-3">
                <span className="flex items-center gap-1.5 font-jbmono text-[8.5px] font-bold tracking-[0.2em] text-cyan-300/90">
                  <ArrowDownToLine size={10} />
                  {downR ? `${fmtSpeed(downR.mbps)} ${speedUnit(downR.mbps)}` : phase === "download" ? "LIVE" : "—"}
                </span>
                <span className="flex items-center gap-1.5 font-jbmono text-[8.5px] font-bold tracking-[0.2em] text-fuchsia-300/90">
                  <ArrowUpFromLine size={10} />
                  {upR ? `${fmtSpeed(upR.mbps)} ${speedUnit(upR.mbps)}` : phase === "upload" ? "LIVE" : "—"}
                </span>
              </div>
              <LiveChart dataRef={chartRef} active={running} />
            </div>

            {/* error banner */}
            <AnimatePresence>
              {phase === "error" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] px-4 py-3"
                >
                  <TriangleAlert size={15} className="shrink-0 text-rose-300" />
                  <div className="text-[12.5px] text-rose-100/90">{error}</div>
                  <button
                    onClick={toggle}
                    className="ml-auto cursor-pointer rounded-full border border-rose-300/30 px-3 py-1 font-jbmono text-[9px] font-bold tracking-[0.18em] text-rose-200 transition-all hover:bg-rose-300/10"
                  >
                    RETRY
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* right — connection + live metrics */}
          <div className="order-3 flex flex-col gap-5">
            <ConnectionCard meta={meta} loaded={metaLoaded} />
            <div className="grid grid-cols-2 gap-3">
              <MetricTile
                icon={Activity}
                label="PING"
                value={latR ? fmtMs(latR.ping) : phase === "latency" ? fmtMs(live) : "—"}
                unit="ms"
                accent="#a78bfa"
                live={phase === "latency"}
                sub={latR ? `avg ${fmtMs(latR.latency)} ms` : "round trip"}
              />
              <MetricTile
                icon={Waves}
                label="JITTER"
                value={latR ? fmtMs(latR.jitter) : "—"}
                unit="ms"
                accent="#fbbf24"
                sub={latR ? (latR.jitter < 5 ? "rock steady" : "variance") : "stability"}
              />
              <MetricTile
                icon={ArrowDownToLine}
                label="DOWNLOAD"
                value={downR ? fmtSpeed(downR.mbps) : phase === "download" ? fmtSpeed(live) : "—"}
                unit={downR ? speedUnit(downR.mbps) : "Mbps"}
                accent="#22d3ee"
                live={phase === "download"}
                sub={downR ? `peak ${fmtSpeed(downR.peak)}` : "throughput"}
              />
              <MetricTile
                icon={ArrowUpFromLine}
                label="UPLOAD"
                value={upR ? fmtSpeed(upR.mbps) : phase === "upload" ? fmtSpeed(live) : "—"}
                unit={upR ? speedUnit(upR.mbps) : "Mbps"}
                accent="#f472b6"
                live={phase === "upload"}
                sub={upR ? `peak ${fmtSpeed(upR.peak)}` : "throughput"}
              />
            </div>
          </div>
        </main>

        {/* results */}
        <AnimatePresence>
          {phase === "done" && result && (
            <ResultsPanel result={result} serverName={server.name} edgeLine={edgeLine} onRetest={toggle} />
          )}
        </AnimatePresence>

        <HistoryPanel
          items={history}
          onClear={() => {
            setHistory([]);
            try {
              localStorage.removeItem("velocity-history");
            } catch {
              /* ignore */
            }
          }}
        />

        <footer className="mt-10 flex flex-col gap-2 border-t border-white/[0.06] pt-5 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2 max-w-3xl">
            <p className="font-jbmono text-[9px] leading-relaxed tracking-[0.12em] text-white/25">
              METHODOLOGY — 5 EDGE NETWORKS RACED BY REAL ROUND-TRIP PROBES · SHORTEST PATH AUTO-SELECTED ·
              THROUGHPUT STREAMED VIA YOUR NEAREST ANYCAST EDGE PoP · TRIMMED-MEAN AGGREGATION
            </p>
            <p className="font-jbmono text-[9px] tracking-[0.12em] text-white/25">
              DEVELOPED BY <a href="https://github.com/nurulanam" target="_blank" rel="noreferrer" className="text-white/40 hover:text-white/60 transition-colors">@NURULANAM</a>
            </p>
          </div>
          <p className="font-jbmono text-[9px] tracking-[0.2em] text-white/25 mt-1 md:mt-0">PRESS SPACE TO RUN</p>
        </footer>
      </div>
    </div>
  );
}
