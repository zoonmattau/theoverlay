import { bookieName } from "@/lib/bookies";
import { Fold } from "../Fold";
import type { MoneyReport } from "@/lib/money";

/** When people press a plan button, by hour and weekday. Moved here from Money, by way of Reports (6 Oct 2026). */
export function PlanClicks({ r }: { r: MoneyReport }) {
  return (
    <Fold title="Plan clicks">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Bars title="By hour, Sydney time" values={r.byHour} labels={r.byHour.map((_, h) => (h % 3 === 0 ? `${h % 12 || 12}${h < 12 ? "am" : "pm"}` : ""))} />
        <Bars title="By weekday" values={r.byWeekday} labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]} />
      </div>
    </Fold>
  );
}

/** Which bookies prices were followed out to. */
export function BookieClicks({ r }: { r: MoneyReport }) {
  return (
    <Fold title="Bookie clicks">
      {r.bookies.length === 0 && <p className="text-sm text-ink-soft">None in the window.</p>}
      {r.bookies.map((b) => (
        <div key={b.bookie} className="panel-row text-sm">
          <span>{bookieName(b.bookie) || b.bookie}</span>
          <span className="nums font-bold">{b.clicks}</span>
        </div>
      ))}
    </Fold>
  );
}

/** A row of bars for hours or weekdays, the count above any bar that has one. */
function Bars({ title, values, labels }: { title: string; values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <figure className="m-0">
      <figcaption className="text-[11px] uppercase tracking-[0.08em] font-extrabold text-ink-soft mb-2">{title}</figcaption>
      <div className="flex items-end gap-1 h-28">
        {values.map((v, i) => (
          // min-w-0 and nowrap: a label ("12pm") wider than its column would otherwise widen that column and its bar.
          <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={`${labels[i] || i}: ${v}`}>
            {v > 0 && <span className="nums text-[10px] text-ink-secondary whitespace-nowrap">{v}</span>}
            <div className="w-full rounded-sm bg-ink" style={{ height: `${Math.max(v ? 4 : 1, (v / max) * 80)}%`, opacity: v ? 1 : 0.15 }} />
            <span className="mt-1 text-[10px] text-ink-soft nums h-3 whitespace-nowrap">{labels[i]}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
