import type { ReviewedRace, ReviewedRunner } from "@/lib/model/review";

/** Formatting the review pages share. */
export const dayLabel = (date: string) => new Date(`${date}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const signed = (n: number | undefined, dp = 1) => (n === undefined || Number.isNaN(n) ? "" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(dp)}`);
export const price = (n?: number) => (n ? `$${n.toFixed(2)}` : "");
export const finish = (r: { finish?: number; margin?: number }) => (r.finish === undefined ? "" : r.finish === 0 ? "DNF" : r.finish === 1 ? "Won" : `${r.finish}${r.margin !== undefined ? ` (${r.margin.toFixed(1)}L)` : ""}`);
const STAGE: Record<string, string> = {
  FULL_SECTIONAL_DATA: "Full",
  OVERALL_AND_600_SECTIONAL: "Time and last 600",
  OVERALL_TIME_ONLY: "Time only",
  SECT_NO_BM: "Sectionals, no benchmark yet",
  NONE: "Nothing yet",
  NOT_FOUND: "Run not found",
};
export const stageOf = (r: ReviewedRunner) => (r.run === undefined ? "Not fetched" : r.run === null ? "Run not found" : (STAGE[r.run.stage] ?? r.run.stage));
export const raceHref = (r: ReviewedRace, date: string) => `/racing/${date}/${r.meeting.meetingId}/${r.race.raceId}`;
export const reviewHref = (r: ReviewedRace, date: string) => `/admin/review/${date}/${r.race.raceId}`;
export const raceLabel = (r: ReviewedRace) => `${r.meeting.track} R${r.race.raceNumber}`;

/** Tone for a gap between the run and our mark: a length either way is noise. */
export const gapClass = (gap?: number) => (gap === undefined ? "" : gap >= 2 ? "text-emerald-700 font-semibold" : gap <= -2 ? "text-red-700 font-semibold" : "");
/** Tone for units won or lost. */
export const unitsClass = (n?: number) => (n === undefined ? "" : n > 0 ? "text-emerald-700 font-semibold" : n < 0 ? "text-red-700 font-semibold" : "");

export function Tag({ tag, side, prime }: { tag?: string; side: "back" | "lay"; prime?: boolean }) {
  if (side === "lay") return <span className="badge badge-lay">Lay</span>;
  if (prime || tag === "prime_overlay" || tag === "top_overlay") return <span className="badge badge-prime">{tag === "top_overlay" ? "Overlay of the Day" : "Prime Overlay"}</span>;
  if (tag === "long_overlay") return <span className="badge badge-back">Long Overlay</span>;
  return <span className="badge badge-back">Bet</span>;
}

/** Every runner in a race against its run: the table the race page is built on. */
export function RunnerTable({ r }: { r: ReviewedRace }) {
  return (
    <table className="data-table w-full text-sm">
      <thead>
        <tr><th>Result</th><th>Horse</th><th>Ours</th><th className="text-right">Our mark</th><th className="text-right">Ran to</th><th className="text-right">Gap</th><th className="text-right">Vs field</th><th className="text-right">Vs class</th><th className="text-right">Early</th><th className="text-right">Last 600</th><th className="text-right">Fin. speed</th><th className="text-right">Settled</th><th className="text-right">Rated</th><th className="text-right">SP</th><th>Data</th></tr>
      </thead>
      <tbody>
        {r.runners.map((x) => (
          <tr key={x.runner.tabNumber}>
            <td className="nums">{finish(x)}</td>
            <td className="font-semibold">{x.runner.tabNumber}. {x.runner.horseName}</td>
            <td className="text-xs">{x.runner.signal ? <Tag side={x.runner.signal} prime={x.runner.prime} /> : x.runner.rank ? <span className="text-ink-soft">#{x.runner.rank}</span> : ""}</td>
            <td className="text-right nums">{x.runner.ratings.today.toFixed(1)}</td>
            <td className="text-right nums">{x.ranTo?.toFixed(1) ?? ""}</td>
            <td className={`text-right nums ${gapClass(x.gap)}`}>{signed(x.gap)}</td>
            <td className={`text-right nums ${gapClass(x.relGap)}`}>{signed(x.relGap)}</td>
            <td className="text-right nums">{signed(x.run?.vsClass)}</td>
            <td className="text-right nums">{signed(x.early)}</td>
            <td className="text-right nums">{signed(x.late)}{x.lateRank ? ` (${x.lateRank})` : ""}{x.run?.last600 ? <span className="text-ink-soft"> {x.run.last600.toFixed(2)}</span> : ""}</td>
            <td className="text-right nums">{x.run?.finishingSpeed ? `${x.run.finishingSpeed.toFixed(1)}%` : ""}</td>
            <td className="text-right nums">{x.run?.posSettling ?? ""}</td>
            <td className="text-right nums">{price(x.runner.ratedPrice)}</td>
            <td className="text-right nums">{price(x.sp)}</td>
            <td className="text-ink-soft text-xs">{stageOf(x)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
