import { useEffect, useRef, type MutableRefObject } from "react";

export interface ChartPoint {
  t: number;
  v: number;
  phase: "download" | "upload";
}

interface LiveChartProps {
  dataRef: MutableRefObject<ChartPoint[]>;
  downColor?: string;
  upColor?: string;
  active: boolean;
}

const WINDOW_MS = 16000;

export default function LiveChart({ dataRef, downColor = "#22d3ee", upColor = "#f472b6", active }: LiveChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maxRef = useRef(50);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return;
      last = now;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const pts = dataRef.current;
      const tNow = pts.length ? pts[pts.length - 1].t : performance.now();
      const minT = tNow - WINDOW_MS;
      while (pts.length && pts[0].t < minT - 4000) pts.shift();
      const view = pts.filter((p) => p.t >= minT);

      // smooth vertical scale
      const target = Math.max(25, ...view.map((p) => p.v)) * 1.18;
      maxRef.current += (target - maxRef.current) * 0.09;
      const maxV = maxRef.current;

      // grid
      ctx.strokeStyle = "rgba(148,163,184,0.10)";
      ctx.lineWidth = 1;
      ctx.font = "600 9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(148,163,184,0.35)";
      ctx.textAlign = "left";
      for (const f of [0.25, 0.5, 0.75]) {
        const y = h - 8 - f * (h - 26);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillText(`${Math.round(maxV * f)}`, 6, y - 3);
      }
      // baseline
      ctx.strokeStyle = "rgba(148,163,184,0.18)";
      ctx.beginPath();
      ctx.moveTo(0, h - 8.5);
      ctx.lineTo(w, h - 8.5);
      ctx.stroke();

      if (!view.length) {
        ctx.setLineDash([3, 7]);
        ctx.strokeStyle = "rgba(148,163,184,0.25)";
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(148,163,184,0.4)";
        ctx.font = "600 10px 'JetBrains Mono', monospace";
        ctx.fillText(active ? "OPENING STREAMS…" : "LIVE THROUGHPUT — AWAITING TEST", w / 2, h / 2 - 8);
        return;
      }

      const x = (t: number) => ((t - minT) / WINDOW_MS) * w;
      const y = (v: number) => h - 8 - Math.min(1, v / maxV) * (h - 26);

      // area fill tinted by the latest phase color
      const lastPhase = view[view.length - 1].phase;
      const fillColor = lastPhase === "upload" ? upColor : downColor;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, fillColor + "2e");
      grad.addColorStop(1, fillColor + "00");
      ctx.beginPath();
      ctx.moveTo(x(view[0].t), h - 8);
      for (const p of view) ctx.lineTo(x(p.t), y(p.v));
      ctx.lineTo(x(view[view.length - 1].t), h - 8);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // stroke segments colored per phase
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (let i = 1; i < view.length; i++) {
        const p0 = view[i - 1];
        const p1 = view[i];
        const c = p1.phase === "upload" ? upColor : downColor;
        ctx.strokeStyle = c;
        ctx.shadowColor = c;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(x(p0.t), y(p0.v));
        ctx.lineTo(x(p1.t), y(p1.v));
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // head dot + value tag
      const lp = view[view.length - 1];
      const c = lastPhase === "upload" ? upColor : downColor;
      ctx.beginPath();
      ctx.arc(x(lp.t), y(lp.v), 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = c;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.textAlign = "right";
      ctx.font = "700 11px 'JetBrains Mono', monospace";
      ctx.fillStyle = c;
      ctx.fillText(`${lp.v.toFixed(lp.v >= 100 ? 0 : 1)} Mbps`, w - 10, 16);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [dataRef, downColor, upColor, active]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
