import { RankChip } from "./Badge";
import { SignalBadge } from "./Ratings";
import { Section } from "./Section";
import { price } from "@/lib/format";
import type { Placing, PublishedRace } from "@/lib/model/types";

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

/** The first four home with dividends. */
export function Results({ race }: { race: PublishedRace }) {
  if (!race.placings?.length) return null;
  const byTab = new Map(race.runners.map((r) => [r.tabNumber, r]));

  return (
    <div className="space-y-3">
      <Section id="results" letter="✓" title="Results, first four">
        <ul>
          {race.placings.map((p) => {
            const r = byTab.get(p.tabNumber);
            const won = p.position === 1;
            return (
              <li key={p.tabNumber} className={`result-row place-${p.position}`}>
                <span className={`place-badge place-${p.position}`}>
                  {ORDINAL[p.position] ?? `${p.position}th`}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-extrabold text-base">
                      {p.tabNumber}. {r?.horseName ?? "—"}
                    </span>
                    {r?.barrier ? <span className="text-ink-soft text-xs">(B{r.barrier})</span> : null}
                    {r?.rank ? <RankChip rank={r.rank} /> : null}
                    <SignalBadge signal={r?.signal} prime={r?.prime} />
                  </div>
                  <div className="text-xs text-ink-soft mt-0.5">
                    {r?.jockey ? `J: ${r.jockey}` : ""}
                    {r?.trainer ? ` · T: ${r.trainer}` : ""}
                    {p.margin !== undefined && !won ? ` · ${p.margin.toFixed(1)}L` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {won && (
                    <div className="div-box is-win">
                      <div className="label">{winLabel(p)}</div>
                      <div className="value nums">{price(p.win ?? p.sp ?? p.bsp ?? p.jump)}</div>
                    </div>
                  )}
                  {p.place || p.bspPlace ? (
                    <div className="div-box">
                      <div className="label">{p.place ? "Place" : "BSP place"}</div>
                      <div className="value nums">{price(p.place ?? p.bspPlace)}</div>
                    </div>
                  ) : !won && (p.bsp ?? p.jump) ? (
                    <div className="div-box">
                      <div className="label">{p.bsp ? "BSP" : "Jump"}</div>
                      <div className="value nums">{price(p.bsp ?? p.jump)}</div>
                    </div>
                  ) : (
                    <span className="text-ink-soft px-4">—</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

/** The win box says which price it is: the dividend or SP once official, Betfair SP or the jump price until then. */
function winLabel(p: Placing): string {
  return p.win || p.sp ? "Win" : p.bsp ? "BSP" : "Jump";
}
