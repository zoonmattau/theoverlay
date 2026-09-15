import Link from "next/link";
import { Badge } from "./Badge";
import { bestBookie } from "@/lib/bookies";
import { price, priceWithChance, signedPercent, TAG_BLURB, TAG_LABEL } from "@/lib/format";
import type { Selection } from "@/lib/model/types";

/** The same card with the horse and prices held back, for visitors. */
export function LockedSelectionCard({ s }: { s: Selection }) {
  const prime = s.tag === "prime_overlay";
  const lay = s.tag === "lay";
  return (
    <Link
      href="/pricing"
      className={`group card card-hover block border-t-4 ${prime ? "border-t-lime" : lay ? "border-t-red" : "border-t-blue"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <Badge tone={prime ? "prime" : lay ? "lay" : "back"}>{TAG_LABEL[s.tag]}</Badge>
        <span className="text-[11px] text-ink-soft uppercase tracking-wider">
          {s.track} R{s.raceNumber}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="h-6 w-40 rounded bg-surface-alt" aria-hidden="true" />
        <span className="ml-auto shrink-0">
          <Outcome position={s.finishPosition} />
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-soft">{TAG_BLURB[s.tag]}</p>
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-3">
        <Stat label={bestBookie(s.bookies)?.name ?? "Live"} value={price(s.marketPrice)} muted />
        <Stat label="Rated" value="$—" muted />
        <Stat label="Edge" value={lay ? "-—%" : "+—%"} accent={prime} blue={!prime && !lay} red={lay} />
      </dl>
      <span className="btn btn-primary w-full mt-4">Try free for 7 days</span>
    </Link>
  );
}

/** Won, placed or unplaced once the race is run. */
export function Outcome({ position }: { position?: number }) {
  if (position === undefined) return null;
  if (position === 1) return <span className="badge badge-prime">Won</span>;
  if (position >= 2 && position <= 3) return <span className="badge badge-warn">{position === 2 ? "2nd" : "3rd"}</span>;
  return <span className="badge badge-muted">{position ? `${position}th` : "Unplaced"}</span>;
}

export function SelectionCard({ s, date }: { s: Selection; date: string }) {
  const prime = s.tag === "prime_overlay";
  const lay = s.tag === "lay";
  const run = s.finishPosition !== undefined;
  return (
    <Link
      href={`/racing/${date}/${s.meetingId}/${s.raceId}`}
      className={`group card card-hover block border-t-4 ${
        prime ? "border-t-lime" : lay ? "border-t-red" : "border-t-blue"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <Badge tone={prime ? "prime" : lay ? "lay" : "back"}>{TAG_LABEL[s.tag]}</Badge>
        <span className="text-[11px] text-muted uppercase tracking-wider">
          {s.track} R{s.raceNumber}
        </span>
      </div>

      <div className={`mt-4 flex items-center gap-2 ${run && s.finishPosition !== 1 ? "opacity-70" : ""}`}>
        <span className="nums text-ink-soft text-sm">{s.tabNumber}</span>
        <h3 className="font-display text-xl font-extrabold tracking-tight truncate">
          {s.horseName}
        </h3>
        <span className="ml-auto shrink-0">
          {lay && run ? (
            <span className={`badge ${s.finishPosition === 1 ? "badge-lay" : "badge-prime"}`}>{s.finishPosition === 1 ? "Lay lost" : "Lay held"}</span>
          ) : (
            <Outcome position={s.finishPosition} />
          )}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted">{TAG_BLURB[s.tag]}</p>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-3">
        <Stat label="Live" value={price(s.marketPrice)} muted />
        <Stat label="Rated" value={priceWithChance(s.ratedPrice, s.ratedProbability)} />
        <Stat label="Edge" value={signedPercent(s.edge)} accent={prime} blue={!prime && !lay} red={lay} />
      </dl>
    </Link>
  );
}

function Stat({
  label,
  value,
  muted,
  accent,
  blue,
  red,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
  blue?: boolean;
  red?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd
        className={`nums font-semibold mt-1 ${
          accent ? "text-accent" : blue ? "text-blue" : red ? "text-red" : muted ? "text-ink-secondary" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Shown when nothing clears the edge threshold. */
/** Shown in place of the calls before the morning release. */
export function ReleaseNotice({ hour = 8 }: { hour?: number }) {
  return (
    <div className="card border-lime bg-lime-soft">
      <h3 className="font-display text-lg font-bold">Today&apos;s calls release at {hour}:00am AEST</h3>
      <p className="mt-2 text-sm text-ink-secondary max-w-prose">
        The board, fields and ratings are up now, and the bets and lays land at {hour}am with fresh prices.
      </p>
    </div>
  );
}

export function NoBetNotice() {
  return (
    <div className="card">
      <h3 className="font-display text-lg font-bold">No overlays on today&apos;s card</h3>
      <p className="mt-2 text-sm text-ink-secondary max-w-prose">
        No race today clears our edge threshold, and we do not manufacture a bet to fill the space.
      </p>
    </div>
  );
}
