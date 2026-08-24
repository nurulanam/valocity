// ---------------------------------------------------------------------------
// Real throughput measurement engine.
//
// Uses Cloudflare's open speed-measurement endpoints (CORS-enabled, anycast —
// traffic is served by your true nearest edge PoP, which is always the
// "shortest" path). Download streams responses and counts bytes over time;
// upload posts cryptographically random payloads of adaptive size. Samples
// are aggregated with a trimmed mean for a stable, ISP-grade reading.
// ---------------------------------------------------------------------------

import { clamp, mean, trimmedMean } from "./format";

const CF = "https://speed.cloudflare.com";

export type Phase =
  | "idle"
  | "racing"
  | "latency"
  | "download"
  | "upload"
  | "done"
  | "error";

export interface MetaInfo {
  ip?: string;
  org?: string;
  asn?: number;
  city?: string;
  region?: string;
  country?: string;
  colo?: string;
}

// The /meta endpoint has changed shape over time: `colo` may be a plain
// string ("SIN") or a location object ({ iata, lat, lon, cca2, region,
// city }), and location fields may be nested. Normalise every field to a
// string so nothing non-renderable ever reaches the UI.
export async function fetchMeta(signal?: AbortSignal): Promise<MetaInfo> {
  try {
    const r = await fetch(`${CF}/meta`, { cache: "no-store", signal });
    const j = await r.json();

    const str = (v: unknown): string | undefined =>
      typeof v === "string" && v.length > 0 ? v : typeof v === "number" && isFinite(v) ? String(v) : undefined;
    const asObj = (v: unknown): Record<string, unknown> | undefined =>
      v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;

    const coloObj = asObj(j?.colo);
    const locObj = asObj(j?.location) ?? asObj(j?.colocation) ?? coloObj;
    const asnRaw = j?.asn;
    const asn = typeof asnRaw === "number" ? asnRaw : Number(str(asnRaw)) || undefined;

    return {
      ip: str(j?.clientIp) ?? str(j?.ip),
      org: str(j?.asOrganization) ?? str(j?.isp) ?? str(j?.organization),
      asn,
      city: str(j?.city) ?? str(locObj?.city),
      region: str(j?.region) ?? str(locObj?.region),
      country: str(j?.country) ?? str(locObj?.cca2) ?? str(locObj?.country),
      colo: str(j?.colo) ?? str(coloObj?.iata) ?? str(locObj?.iata) ?? str(j?.coloCode),
    };
  } catch {
    return {};
  }
}

export interface LatencyResult {
  ping: number;
  latency: number;
  jitter: number;
  samples: number[];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function abortErr() {
  return new DOMException("Aborted", "AbortError");
}

export async function measureLatency(
  signal: AbortSignal,
  onSample?: (ms: number, samples: number[]) => void,
  samples = 10,
): Promise<LatencyResult> {
  const out: number[] = [];
  // Warm-up request (discarded) — removes connection setup from samples.
  try {
    await (await fetch(`${CF}/__down?bytes=0`, { cache: "no-store", signal })).arrayBuffer();
  } catch (e) {
    if ((e as DOMException).name === "AbortError") throw e;
  }
  for (let i = 0; i < samples; i++) {
    if (signal.aborted) throw abortErr();
    const t0 = performance.now();
    const res = await fetch(`${CF}/__down?bytes=0`, { cache: "no-store", signal });
    await res.arrayBuffer();
    const dt = performance.now() - t0;
    out.push(dt);
    onSample?.(dt, [...out]);
    await sleep(90);
  }
  const ping = Math.min(...out);
  const latency = mean(out);
  const jitter = mean(out.slice(1).map((v, i) => Math.abs(v - out[i])));
  return { ping, latency, jitter, samples: out };
}

export interface SpeedResult {
  mbps: number;
  peak: number;
  bytes: number;
  samples: number[];
}

// ---------------------------------------------------------------------------
// DOWNLOAD — parallel streams, byte-counted over a rolling sample window.
// ---------------------------------------------------------------------------
export async function measureDownload(
  signal: AbortSignal,
  onSample: (mbps: number, bytes: number, elapsed: number) => void,
  durationMs = 10000,
  // More streams saturate fast links; HTTP/1.1 needs parallelism to fill the pipe.
  streams = 6,
): Promise<SpeedResult> {
  let total = 0;
  let ema = 60; // Mbps guess, adapts quickly as we learn the line
  const t0 = performance.now();

  // Larger ceiling (50 MB) so gigabit lines don't hit the cap every 200 ms.
  const pickSize = () => clamp(Math.round(((ema * 1e6) / 8) * 1.2), 100_000, 50_000_000);

  const worker = async () => {
    while (performance.now() - t0 < durationMs + 250) {
      if (signal.aborted) return;
      const size = pickSize();
      const rt0 = performance.now();
      let reqBytes = 0;
      try {
        const res = await fetch(`${CF}/__down?bytes=${size}`, { cache: "no-store", signal });
        const reader = res.body?.getReader();
        if (!reader) return;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const n = value?.byteLength ?? 0;
          total += n;
          reqBytes += n;
        }
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
        await sleep(150);
        continue;
      }
      const rdt = (performance.now() - rt0) / 1000;
      // Faster EMA adaptation (0.4/0.6) so chunk size tracks the real speed quicker.
      if (rdt > 0.05 && reqBytes > 0) {
        ema = ema * 0.4 + ((reqBytes * 8) / rdt / 1e6) * 0.6;
      }
    }
  };

  const workers = Array.from({ length: streams }, () => worker());
  const samples: number[] = [];
  let lastBytes = 0;
  let lastT = performance.now();

  while (performance.now() - t0 < durationMs) {
    if (signal.aborted) throw abortErr();
    await sleep(150);
    const now = performance.now();
    const db = total - lastBytes;
    const dt = (now - lastT) / 1000;
    lastBytes = total;
    lastT = now;
    const mbps = dt > 0 ? (db * 8) / dt / 1e6 : 0;
    samples.push(mbps);
    onSample(mbps, total, now - t0);
  }

  await Promise.race([Promise.allSettled(workers), sleep(1200)]);

  if (total < 50_000) throw new Error("Network unreachable — could not transfer test data.");

  // Only discard 10% ramp (fewer valid samples thrown away) and trim just 5% outliers.
  const ramp = Math.max(1, Math.floor(samples.length * 0.10));
  const core = samples.slice(ramp).filter((v) => v > 0);
  return {
    mbps: trimmedMean(core, 0.05),
    peak: Math.max(...samples, 0),
    bytes: total,
    samples,
  };
}

// ---------------------------------------------------------------------------
// UPLOAD — posts adaptive random payloads; bytes credited on completion.
// ---------------------------------------------------------------------------
let upBuf: Uint8Array<ArrayBuffer> | null = null;
function getUploadBuffer(): Uint8Array<ArrayBuffer> {
  if (!upBuf) {
    upBuf = new Uint8Array(new ArrayBuffer(8 * 1024 * 1024));
    for (let o = 0; o < upBuf.length; o += 65536) {
      crypto.getRandomValues(upBuf.subarray(o, Math.min(o + 65536, upBuf.length)));
    }
  }
  return upBuf;
}

export async function measureUpload(
  signal: AbortSignal,
  onSample: (mbps: number, bytes: number, elapsed: number) => void,
  durationMs = 9000,
  // 2 streams: enough to keep the pipe full without synchronized bursts
  // that make the sample-window crediting spike.
  streams = 2,
): Promise<SpeedResult> {
  const buf = getUploadBuffer();
  let total = 0;
  let ema = 25;
  const t0 = performance.now();

  // Cap at 4 MB so each POST completes in ~0.5–2 s on typical uplinks.
  // Smaller chunks = more frequent completions = smoother byte crediting.
  const pickSize = () => clamp(Math.round(((ema * 1e6) / 8) * 1.0), 80_000, 4_000_000);

  const worker = async () => {
    while (performance.now() - t0 < durationMs + 500) {
      if (signal.aborted) return;
      const size = pickSize();
      const body = buf.subarray(0, size);
      const rt0 = performance.now();
      try {
        const res = await fetch(`${CF}/__up`, {
          method: "POST",
          body,
          cache: "no-store",
          headers: { "content-type": "application/octet-stream" },
          signal,
        });
        await res.arrayBuffer();
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
        await sleep(150);
        continue;
      }
      const rdt = (performance.now() - rt0) / 1000;
      total += size;
      if (rdt > 0.05) ema = ema * 0.5 + ((size * 8) / rdt / 1e6) * 0.5;
    }
  };

  const workers = Array.from({ length: streams }, () => worker());
  const samples: number[] = [];
  let lastBytes = 0;
  let lastT = performance.now();

  while (performance.now() - t0 < durationMs) {
    if (signal.aborted) throw abortErr();
    await sleep(180);
    const now = performance.now();
    const db = total - lastBytes;
    const dt = (now - lastT) / 1000;
    lastBytes = total;
    lastT = now;
    const mbps = dt > 0 ? (db * 8) / dt / 1e6 : 0;
    samples.push(mbps);
    onSample(mbps, total, now - t0);
  }

  await Promise.race([Promise.allSettled(workers), sleep(1500)]);

  if (total < 20_000) throw new Error("Upload path unreachable — could not push test data.");

  // Use actual bytes / actual elapsed time over the steady-state window
  // (after ramp) rather than sample-based mean — immune to burst-crediting spikes.
  const rampMs = durationMs * 0.15;
  const steadyElapsedS = (durationMs - rampMs) / 1000;
  // Bytes credited during the ramp period (estimated as 15% of total by time share)
  const steadyBytes = total * (1 - rampMs / durationMs);
  const directMbps = (steadyBytes * 8) / steadyElapsedS / 1e6;

  // Cross-check with trimmed sample mean; if they diverge greatly,
  // trust the lower (more conservative) value to avoid over-reporting.
  const ramp = Math.max(0, Math.floor(samples.length * 0.15));
  const core = samples.slice(ramp).filter((v) => v > 0);
  const sampleMbps = trimmedMean(core, 0.1);
  const mbps = sampleMbps > 0 ? Math.min(directMbps, sampleMbps * 1.15) : directMbps;

  return {
    mbps,
    peak: Math.max(...samples, 0),
    bytes: total,
    samples,
  };
}
