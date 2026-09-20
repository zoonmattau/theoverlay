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

/** Our mapped tempo against the one the leader set: "even → fast". */
export const tempoOf = (r: ReviewedRace) => `${r.race.pace.tempo} → ${r.tempo ?? "?"}`;
/** Tone for the tempo: red when the race ran to a different speed from the one we mapped. */
export const tempoClass = (r: ReviewedRace) => (r.tempo === undefined ? "text-ink-soft" : r.tempo === r.race.pace.tempo ? "" : "text-red-700 font-semibold");
/** Where we mapped a runner against where it settled: "3 → 7". */
export const settledOf = (x: ReviewedRunner) => `${x.runner.ratings.ppir || "?"} → ${x.run?.posSettling ?? "?"}`;
/** Tone for a runner's settled position: red when it was three or more places off our map. */
export const settledClass = (x: ReviewedRunner) => (x.run?.posSettling === undefined || !x.runner.ratings.ppir ? "text-ink-soft" : Math.abs(x.run.posSettling - x.runner.ratings.ppir) >= 3 ? "text-red-700 font-semibold" : "");
/** How a mark and a gap are read, for the column heads. */
export const EXPECTED_TIP = "The race's par plus how far the horse's mark sat above or below the field's average mark: what we expected it to run to.";
export const GAP_TIP = "Ran to minus expected, in points. A length is about a point.";
export const TIME_TIP = "The horse's own time, read off the winner's by the margin at a sixth of a second a length.";
export const L600_TIP = "The horse's own last 600, read off the winner's clock by how the two ran against the class benchmark over that section. Blank where the feed sent no last 600 for the race.";
/** A race time as the clock shows it, 1:23.45. */
export const clock = (t?: number) => (t === undefined ? "" : t >= 60 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}` : t.toFixed(2));

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
        <tr><th>Result</th><th>Horse</th><th>Ours</th><th className="text-right" title={EXPECTED_TIP}>Expected</th><th className="text-right">Ran to</th><th className="text-right" title={GAP_TIP}>Gap</th><th className="text-right">Vs class</th><th className="text-right" title={TIME_TIP}>Time</th><th className="text-right" title={L600_TIP}>L600</th><th className="text-right">Early</th><th className="text-right">Last 600</th><th className="text-right">Fin. speed</th><th className="text-right">Settled</th><th className="text-right">800</th><th className="text-right">400</th><th className="text-right">Rated</th><th className="text-right">SP</th><th>Data</th></tr>
      </thead>
      <tbody>
        {r.runners.map((x) => (
          <tr key={x.runner.tabNumber}>
            <td className="nums">{finish(x)}</td>
            <td className="font-semibold">{x.runner.tabNumber}. {x.runner.horseName}</td>
            <td className="text-xs">{x.runner.signal ? <Tag side={x.runner.signal} prime={x.runner.prime} /> : x.runner.rank ? <span className="text-ink-soft">#{x.runner.rank}</span> : ""}</td>
            <td className="text-right nums">{x.expected.toFixed(1)}</td>
            <td className="text-right nums">{x.ranTo?.toFixed(1) ?? ""}</td>
            <td className={`text-right nums ${gapClass(x.gap)}`}>{signed(x.gap)}</td>
            <td className="text-right nums">{signed(x.run?.vsClass)}</td>
            <td className="text-right nums">{clock(x.ownTime)}</td>
            <td className="text-right nums">{x.ownLast600?.toFixed(2) ?? ""}</td>
            <td className="text-right nums">{signed(x.early)}</td>
            <td className="text-right nums">{signed(x.late)}{x.lateRank ? ` (${x.lateRank})` : ""}</td>
            <td className="text-right nums">{x.run?.finishingSpeed ? `${x.run.finishingSpeed.toFixed(1)}%` : ""}</td>
            <td className={`text-right nums ${settledClass(x)}`}>{settledOf(x)}</td>
            <td className="text-right nums">{x.run?.pos800 ?? ""}</td>
            <td className="text-right nums">{x.run?.pos400 ?? ""}</td>
            <td className="text-right nums">{price(x.runner.ratedPrice)}</td>
            <td className="text-right nums">{price(x.sp)}</td>
            <td className="text-ink-soft text-xs">{stageOf(x)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
