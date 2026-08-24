// ---------------------------------------------------------------------------
// Multi-server latency race.
//
// Each "server" is a real global edge network. We probe each with timed,
// cache-busted requests (CORS where available, opaque no-cors requests
// otherwise — timing is still real round-trip data), warm up the connection
// first, then take 4 samples. The fleet is re-sorted shortest-latency-first
// and the winner is auto-selected, exactly like a real speed test client.
// ---------------------------------------------------------------------------

export interface EdgeServer {
  id: string;
  name: string;
  vendor: string;
  tag: string;
  probe: string;
  cors: boolean;
  accent: string;
}

export const SERVERS: EdgeServer[] = [
  {
    id: "cloudflare",
    name: "Cloudflare Edge",
    vendor: "Anycast · nearest PoP",
    tag: "GLOBAL",
    probe: "https://speed.cloudflare.com/__down?bytes=0",
    cors: true,
    accent: "#f59e0b",
  },
  {
    id: "google",
    name: "Google Edge",
    vendor: "Global cache · 204 probe",
    tag: "GLOBAL",
    probe: "https://www.gstatic.com/generate_204",
    cors: false,
    accent: "#34d399",
  },
  {
    id: "aws",
    name: "AWS CloudFront",
    vendor: "Amazon edge network",
    tag: "GLOBAL",
    probe: "https://aws.amazon.com/favicon.ico",
    cors: false,
    accent: "#fb923c",
  },
  {
    id: "azure",
    name: "Microsoft WAN",
    vendor: "Azure global backbone",
    tag: "GLOBAL",
    probe: "https://www.microsoft.com/favicon.ico",
    cors: false,
    accent: "#60a5fa",
  },
  {
    id: "github",
    name: "GitHub / Fastly",
    vendor: "Fastly CDN PoP",
    tag: "GLOBAL",
    probe: "https://github.com/favicon.ico",
    cors: false,
    accent: "#e2e8f0",
  },
];

export type ProbeStatus = "queued" | "measuring" | "done" | "fail";

export interface ProbeState {
  id: string;
  status: ProbeStatus;
  samples: number[];
  avg?: number;
  min?: number;
  jitter?: number;
}

export function initialProbes(): Record<string, ProbeState> {
  const out: Record<string, ProbeState> = {};
  for (const s of SERVERS) out[s.id] = { id: s.id, status: "queued", samples: [] };
  return out;
}

function mean(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}

async function timedFetch(url: string, cors: boolean, timeoutMs: number, signal: AbortSignal) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const onAbort = () => ctl.abort();
  signal.addEventListener("abort", onAbort);
  try {
    const t0 = performance.now();
    const res = await fetch(url, {
      mode: cors ? "cors" : "no-cors",
      cache: "no-store",
      redirect: "follow",
      referrerPolicy: "no-referrer",
      signal: ctl.signal,
    });
    // Consume whatever we are allowed to read so timing includes the body.
    if (cors) await res.arrayBuffer().catch(() => {});
    return performance.now() - t0;
  } finally {
    clearTimeout(t);
    signal.removeEventListener("abort", onAbort);
  }
}

export async function probeServer(
  server: EdgeServer,
  onUpdate: (s: ProbeState) => void,
  signal: AbortSignal,
): Promise<ProbeState> {
  const sep = server.probe.includes("?") ? "&" : "?";
  const state: ProbeState = { id: server.id, status: "measuring", samples: [] };
  onUpdate({ ...state });

  // Warm-up: establishes TCP+TLS so samples reflect round-trip, not handshake.
  try {
    await timedFetch(`${server.probe}${sep}cb=w${Math.random().toString(36).slice(2)}`, server.cors, 3500, signal);
  } catch {
    /* warmup may fail on strict networks; samples will still try */
  }
  if (signal.aborted) return { ...state, status: "fail" };

  for (let i = 0; i < 4; i++) {
    if (signal.aborted) break;
    try {
      const dt = await timedFetch(
        `${server.probe}${sep}cb=${Date.now()}${i}${Math.random().toString(36).slice(2, 6)}`,
        server.cors,
        3500,
        signal,
      );
      state.samples.push(dt);
      state.avg = mean(state.samples);
      state.min = Math.min(...state.samples);
      state.jitter = mean(state.samples.slice(1).map((v, j) => Math.abs(v - state.samples[j])));
      onUpdate({ ...state, samples: [...state.samples] });
    } catch {
      /* sample lost */
    }
    await new Promise((r) => setTimeout(r, 70));
  }

  const ok = state.samples.length >= 2;
  state.status = ok ? "done" : "fail";
  onUpdate({ ...state, samples: [...state.samples] });
  return { ...state, samples: [...state.samples] };
}

export async function raceServers(
  onUpdate: (s: ProbeState) => void,
  signal: AbortSignal,
): Promise<{ bestId: string | null; probes: Record<string, ProbeState> }> {
  const results = await Promise.all(SERVERS.map((s) => probeServer(s, onUpdate, signal)));
  const probes: Record<string, ProbeState> = {};
  let bestId: string | null = null;
  let bestAvg = Infinity;
  for (const r of results) {
    probes[r.id] = r;
    if (r.status === "done" && r.avg != null && r.avg < bestAvg) {
      bestAvg = r.avg;
      bestId = r.id;
    }
  }
  return { bestId, probes };
}
