import { History, Trash2 } from "lucide-react";
import { fmtMs, fmtSpeed, speedUnit, clockTime } from "../lib/format";

export interface HistoryItem {
  ts: number;
  down: number;
  up: number;
  ping: number;
}

export default function HistoryPanel({ items, onClear }: { items: HistoryItem[]; onClear: () => void }) {
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <History size={13} className="text-white/40" />
        <h2 className="font-jbmono text-[10px] font-bold tracking-[0.24em] text-white/40">RECENT TESTS</h2>
        <button
          onClick={onClear}
          title="Clear history"
          className="ml-auto cursor-pointer rounded-full border border-white/10 p-1.5 text-white/40 transition-all hover:border-rose-300/40 hover:text-rose-300"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((it) => (
          <div
            key={it.ts}
            className="glass min-w-[178px] shrink-0 rounded-2xl px-4 py-3 transition-colors hover:border-white/20"
          >
            <div className="font-jbmono text-[9px] tracking-[0.2em] text-white/30">{clockTime(it.ts)}</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-jbmono text-[15px] font-bold tabular text-cyan-300">
                {fmtSpeed(it.down)}
                <span className="ml-0.5 text-[8px] text-white/35">{speedUnit(it.down)}</span>
              </span>
              <span className="font-jbmono text-[8px] tracking-wider text-white/25">DOWN</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-jbmono text-[12px] font-semibold tabular text-fuchsia-300">
                {fmtSpeed(it.up)}
                <span className="ml-0.5 text-[8px] text-white/35">{speedUnit(it.up)}</span>
              </span>
              <span className="font-jbmono text-[8px] tracking-wider text-white/25">UP</span>
              <span className="ml-auto font-jbmono text-[9px] tabular text-white/35">{fmtMs(it.ping)} ms</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
