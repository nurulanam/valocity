import type { LucideIcon } from "lucide-react";
import { Building2, Fingerprint, Hash, MapPin } from "lucide-react";
import type { MetaInfo } from "../lib/engine";

export function ConnectionCard({ meta, loaded }: { meta: MetaInfo | null; loaded: boolean }) {
  const empty = loaded && meta && !meta.ip;
  const rows: { icon: LucideIcon; label: string; value?: string; chip?: string }[] = [
    { icon: Fingerprint, label: "IP ADDRESS", value: meta?.ip },
    { icon: Building2, label: "PROVIDER", value: meta?.org },
    { icon: Hash, label: "ASN", value: meta?.asn ? `AS${meta.asn}` : undefined },
    {
      icon: MapPin,
      label: "EDGE PoP",
      value: meta?.city ? `${meta.city}${meta.region ? ` · ${meta.region}` : ""}` : meta?.country,
      chip: meta?.colo,
    },
  ];

  return (
    <section className="glass rounded-3xl p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Fingerprint size={13} className="text-violet-300/80" />
        <h2 className="font-jbmono text-[10px] font-bold tracking-[0.24em] text-white/50">CONNECTION</h2>
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map(({ icon: Icon, label, value, chip }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-1.5 text-white/40">
              <Icon size={12} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-jbmono text-[8.5px] font-semibold tracking-[0.2em] text-white/30">{label}</div>
              {!loaded ? (
                <div className="shimmer mt-1 h-3.5 w-24 rounded-md" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="truncate font-jbmono text-[11.5px] font-semibold tracking-wide text-white/85">
                    {value || (empty ? "UNAVAILABLE" : "—")}
                  </span>
                  {chip && (
                    <span className="rounded-full border border-violet-300/30 bg-violet-300/10 px-1.5 py-[1px] font-jbmono text-[8.5px] font-bold tracking-widest text-violet-200">
                      {chip}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface MetricTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  sub?: string;
  accent: string;
  live?: boolean;
}

export function MetricTile({ icon: Icon, label, value, unit, sub, accent, live }: MetricTileProps) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-3.5">
      {live && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.10] transition-opacity"
          style={{ background: `radial-gradient(120% 100% at 50% 0%, ${accent}, transparent 70%)` }}
        />
      )}
      <div className="mb-2 flex items-center gap-1.5">
        <Icon size={11} style={{ color: accent }} />
        <span className="font-jbmono text-[8.5px] font-bold tracking-[0.22em] text-white/40">{label}</span>
        {live && <span className="anim-blink ml-auto h-1 w-1 rounded-full" style={{ background: accent }} />}
      </div>
      <div className="font-jbmono text-[22px] font-bold leading-none tabular" style={{ color: live ? accent : "#e9edf7" }}>
        {value}
        <span className="ml-1 text-[10px] font-medium text-white/35">{unit}</span>
      </div>
      {sub && <div className="mt-1.5 truncate font-jbmono text-[8.5px] tracking-wide text-white/30">{sub}</div>}
    </div>
  );
}
