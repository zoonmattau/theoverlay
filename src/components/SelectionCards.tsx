import { BookieLink } from "./BookieLink";
import { MarketHover } from "./MarketHover";
import { Factors } from "./Factors";
import { SignalBadge, MAP_LABEL } from "./Ratings";
import { percent, price } from "@/lib/format";
import type { PublishedRace, PublishedRunner } from "@/lib/model/types";

/**
 * Our top four, side by side. Live price against the rated price, one
 * sentence on why, and the four numbers that matter for that runner.
 */
export interface TipsterCall {
  tabNumber: number;
  side: "back" | "lay";
  price: number;
  bookie?: string | null;
  bookiePrice?: number | null;
  comment?: string | null;
}

export function SelectionCards({ race, tipster }: { race: PublishedRace; tipster?: { name: string; calls: TipsterCall[] } }) {
  const theirs = new Map((tipster?.calls ?? []).map((c) => [c.tabNumber, c]));
  const tip = (c: TipsterCall) =>
    `${tipster!.name}: ${c.side === "back" ? "Bet" : "Lay"} at ${price(c.price)}${c.bookiePrice ? `, ${price(c.bookiePrice)}${c.bookie ? ` at ${c.bookie}` : ""}` : c.bookie ? ` at ${c.bookie}` : ""}.${c.comment ? ` ${c.comment}` : ""}`;
  const picks = race.runners
    .filter((r): r is PublishedRunner & { rank: number } => r.rank !== null)
    .sort((a, b) => a.rank - b.rank);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {picks.map((r) => (
        <article key={r.tabNumber} className={`pick-card ${r.rank === 1 ? "is-top" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="pick-rank">#{r.rank}</div>
              <div className="pick-name truncate">
                {r.tabNumber}. {r.horseName}
                {theirs.has(r.tabNumber) && (
                  <span className="tipster-mark tip ml-1.5" data-tip={tip(theirs.get(r.tabNumber)!)}>
                    {tipster!.name.trim()[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-ink-soft mt-0.5">
                Bar {r.barrier}
                {r.weight ? ` · ${r.weight}kg` : ""}
                {r.jockey ? ` · ${r.jockey}` : ""}
              </div>
            </div>
            <SignalBadge signal={r.signal} prime={r.prime} />
          </div>

          <div className="flex gap-2">
            <div className={`price-box ${r.prime ? "is-prime" : r.signal === "back" ? "is-back" : r.signal === "lay" ? "is-lay" : ""}`}>
              <div className="label">Live</div>
              <MarketHover r={r}><div className="value nums">{price(r.marketPrice)}</div></MarketHover>
              <BookieLink codes={r.bookies} raceId={race.raceId} className="block text-[10px] font-semibold mt-0.5" />
            </div>
            <div className="price-box">
              <div className="label">Rated</div>
              <div className="value nums">
                {price(r.ratedPrice)} <span className="text-xs text-ink-soft font-semibold">{percent(r.ratedProbability)}</span>
              </div>
            </div>
          </div>

          <p className="pick-why flex-1">{r.why ?? ""}</p>

          <div className="flex items-center gap-3 pt-2 border-t border-line-soft mt-auto">
            <div className="today-tile py-2 px-3 min-w-[96px]">
              <div className="today-label">Today</div>
              <div className="today-value nums text-2xl">{r.ratings.today.toFixed(1)}</div>
            </div>
            <div className="pick-nums flex-1 border-t-0 pt-0" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <Num label="Class" value={r.ratings.class.toFixed(1)} />
              <Num label="Late" value={r.ratings.late.toFixed(1)} />
              <Num label="Map" value={MAP_LABEL[r.ratings.map]} small />
            </div>
          </div>
          <Factors r={r.ratings} compact />
        </article>
      ))}
    </div>
  );
}

function Num({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="pick-num">
      <div className="label">{label}</div>
      <div className={`value ${small ? "text-[0.72rem]" : "nums"}`}>{value}</div>
    </div>
  );
}
