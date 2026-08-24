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
  streams = 3,
): Promise<SpeedResult> {
  let total = 0;
  let ema = 60; // Mbps guess, adapts as we learn the line
  const t0 = performance.now();

  const pickSize = () => clamp(Math.round(((ema * 1e6) / 8) * 1.1), 100_000, 25_000_000);

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
        await sleep(150); // transient failure — small backoff, keep going
        continue;
      }
      const rdt = (performance.now() - rt0) / 1000;
      if (rdt > 0.1 && reqBytes > 0) {
        ema = ema * 0.55 + ((reqBytes * 8) / rdt / 1e6) * 0.45;
      }
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

  // Let in-flight requests settle briefly, then stop the workers.
  await Promise.race([Promise.allSettled(workers), sleep(1200)]);

  if (total < 50_000) throw new Error("Network unreachable — could not transfer test data.");

  const ramp = Math.max(1, Math.floor(samples.length * 0.18));
  const core = samples.slice(ramp).filter((v) => v > 0);
  return {
    mbps: trimmedMean(core, 0.1),
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
  streams = 2,
): Promise<SpeedResult> {
  const buf = getUploadBuffer();
  let total = 0;
  let ema = 25;
  const t0 = performance.now();

  const pickSize = () => clamp(Math.round(((ema * 1e6) / 8) * 1.0), 80_000, 8_000_000);

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
      if (rdt > 0.05) ema = ema * 0.55 + ((size * 8) / rdt / 1e6) * 0.45;
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
  // Final sample if bytes landed right at the end
  if (total > lastBytes) {
    const dt = (performance.now() - lastT) / 1000;
    if (dt > 0) samples.push(((total - lastBytes) * 8) / dt / 1e6);
  }

  if (total < 20_000) throw new Error("Upload path unreachable — could not push test data.");

  const ramp = Math.max(0, Math.floor(samples.length * 0.2));
  const core = samples.slice(ramp).filter((v) => v > 0);
  return {
    mbps: trimmedMean(core, 0.12),
    peak: Math.max(...samples, 0),
    bytes: total,
    samples,
  };
}
