import { PickCard } from "./PickCard";
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
  /** "2u", empty for one unit. */
  stake?: string;
  bookie?: string | null;
  bookiePrice?: number | null;
  comment?: string | null;
}

export function SelectionCards({ race, tipsters = [] }: { race: PublishedRace; tipsters?: { name: string; calls: TipsterCall[] }[] }) {
  // Every followed tipster's call on each runner, in follow order.
  const theirs = new Map<number, { name: string; call: TipsterCall }[]>();
  for (const t of tipsters) for (const c of t.calls) theirs.set(c.tabNumber, [...(theirs.get(c.tabNumber) ?? []), { name: t.name, call: c }]);
  const tip = (name: string, c: TipsterCall) =>
    `${name}: ${c.side === "back" ? "Bet" : "Lay"}${c.stake ? ` ${c.stake}` : ""} at ${price(c.price)}${c.bookiePrice ? `, ${price(c.bookiePrice)}${c.bookie ? ` at ${c.bookie}` : ""}` : c.bookie ? ` at ${c.bookie}` : ""}.${c.comment ? ` ${c.comment}` : ""}`;
  const picks = race.runners
    .filter((r): r is PublishedRunner & { rank: number } => r.rank !== null)
    .sort((a, b) => a.rank - b.rank);

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {picks.map((r) => (
        /* Closed, a pick is its number, its name and the two prices. The why,
           the ratings and the factors are a tap away. */
        <PickCard
          key={r.tabNumber}
          top={r.rank === 1}
          head={<>
            <span className="pick-rank">#{r.rank}</span>
            <span className="pick-name truncate">
              {r.tabNumber}. {r.horseName}
            </span>
            <span className="pick-marks">
              {(theirs.get(r.tabNumber) ?? []).map(({ name, call }) => (
                <span key={name} className="tipster-mark tip tip-right" data-tip={tip(name, call)}>
                  {name.trim()[0]?.toUpperCase()}
                </span>
              ))}
              <SignalBadge signal={r.signal} prime={r.prime} />
            </span>
            <span className="pick-prices">
              <span className={`pick-price ${r.prime ? "is-prime" : r.signal === "back" ? "is-back" : r.signal === "lay" ? "is-lay" : ""}`}>
                <span className="label">Live</span>
                <MarketHover r={r}><span className="value nums">{price(r.marketPrice)}</span></MarketHover>
              </span>
              <span className="pick-price">
                <span className="label">Rated</span>
                <span className="value nums">
                  {price(r.ratedPrice)} <span className="pick-chance">{percent(r.ratedProbability)}</span>
                </span>
              </span>
            </span>
          </>}
        >
            <div className="text-[11px] text-ink-soft">
              Bar {r.barrier}
              {r.weight ? ` · ${r.weight}kg` : ""}
              {r.jockey ? ` · ${r.jockey}` : ""}
            </div>
            <p className="pick-why">{r.why ?? ""}</p>
            <div className="flex items-center gap-3 pt-2 border-t border-line-soft">
              <div className="today-tile py-2 px-3 min-w-[84px]">
                <div className="today-label">Today</div>
                <div className="today-value nums text-xl">{r.ratings.today.toFixed(1)}</div>
              </div>
              <div className="pick-nums flex-1 border-t-0 pt-0" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <Num label="Class" value={r.ratings.class.toFixed(1)} />
                <Num label="Late" value={r.ratings.late.toFixed(1)} />
                <Num label="Map" value={MAP_LABEL[r.ratings.map]} small />
              </div>
            </div>
            <Factors r={r.ratings} compact />
        </PickCard>
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
