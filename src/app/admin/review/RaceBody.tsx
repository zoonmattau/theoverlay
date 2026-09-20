import { stakeOf } from "@/lib/model/types";

import { Section } from "@/components/Section";
import type { Review, ReviewedRace } from "@/lib/model/review";
import { settle } from "@/lib/tips";
import { RaceFetchButton } from "./RaceFetchButton";
import { clock, EXPECTED_TIP, finish, GAP_TIP, gapClass, L600_TIP, price, RunnerTable, settledClass, settledOf, signed, Tag, tempoClass, TIME_TIP, unitsClass } from "./shared";

function Stat({ label, value, sub, className = "" }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="card py-3">
      <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft">{label}</div>
      <div className={`nums text-2xl font-extrabold ${className}`}>{value || "—"}</div>
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
    </div>
  );
}

/** The line under a race's name: class, trip, par, going and the race's clocks. */
export function RaceLine({ r }: { r: ReviewedRace }) {
  // The feed gives every runner the race's clocks, so one runner's is the race's.
  const clocked = r.runners.find((x) => x.run?.time);
  const raceTime = clocked?.run?.time;
  const winner600 = clocked?.run?.last600;
  return (
    <>
      {r.race.className ?? ""} {r.race.distance}m, par {r.race.classPoints}{r.race.goingText ? `, ${r.race.goingText}` : ""}.{raceTime ? ` Run in ${clock(raceTime)}${winner600 ? `, the winner's last 600 in ${winner600.toFixed(2)}` : ""}.` : ""} {r.full} of {r.runners.length} runners with a full benchmark.
    </>
  );
}

/**
 * One race as a whole: the stat cards, its talking points, how it was run,
 * our top four and calls, and every runner against its run. The race page
 * and the story page both build on it; `sections` open or closed sets how
 * the three tables start.
 */
export function RaceBody({ review, r, sections = true }: { review: Review; r: ReviewedRace; sections?: boolean }) {
  const raceId = r.race.raceId;
  const missing = r.runners.filter((x) => x.run === undefined).length;
  const partial = r.runners.filter((x) => x.run !== undefined && x.run?.stage !== "FULL_SECTIONAL_DATA").length;
  const resulted = r.runners.some((x) => x.finish !== undefined);
  const winner = r.runners.find((x) => x.finish === 1);
  const topRated = [...r.runners].sort((a, b) => b.runner.ratings.today - a.runner.ratings.today)[0];
  const calls = r.runners.filter((x) => x.runner.signal && x.runner.marketPrice);
  const settled = calls.filter((x) => x.finish !== undefined);
  const units = settled.reduce((a, x) => a + settle(x.runner.signal!, x.runner.marketPrice!, x.finish!, stakeOf(x.runner)), 0);
  const ours = r.runners.filter((x) => x.runner.rank).sort((a, b) => a.runner.rank! - b.runner.rank!);
  const talking = review.talking.filter((t) => t.runner.race.race.raceId === raceId);
  // The field front to back as it settled, with our map beside it.
  const shape = [...r.runners].filter((x) => x.run?.posSettling).sort((a, b) => a.run!.posSettling! - b.run!.posSettling!);
  const ourLeader = r.runners.find((x) => x.runner.ratings.ppir === 1);

  return (
    <>
      {resulted && (missing > 0 || partial > 0) && (
        <div className="mb-4 text-sm text-ink-soft flex flex-wrap items-center gap-3">
          <span>{missing > 0 ? `${missing} of ${r.runners.length} runs not bought yet.` : `${partial} of ${r.runners.length} runs without a full benchmark: the time and last 600 are in, the sections are not.`}</span>
          <RaceFetchButton date={review.date} raceId={raceId} missing={missing} partial={partial} />
        </div>
      )}
      <div className="grid gap-3 grid-cols-3 md:grid-cols-5 lg:grid-cols-9 mb-4">
        <Stat label="Strength" value={r.strength !== undefined ? `${signed(r.strength)}L` : ""} sub={r.suspect ? "first three vs class: benchmark suspect, left out of the stats" : "first three vs class"} className={r.suspect ? "text-red-700" : ""} />
        <Stat label="Mapped tempo" value={r.race.pace.tempo} sub="before the race" />
        <Stat label="Ran" value={r.tempo ?? ""} sub={r.leaderEarly !== undefined ? `leader ${signed(r.leaderEarly)}L against class early` : "no sections timed yet"} className={tempoClass(r)} />
        <Stat label="Map" value={r.mapFit !== undefined ? `${r.mapFit.toFixed(1)} off` : ""} sub={r.leaderLed === undefined ? "places off our map on average" : `places off our map on average, ${ourLeader?.runner.horseName ?? "our leader"} ${r.leaderLed ? "led as mapped" : `settled ${ourLeader?.run?.posSettling ?? "?"}`}`} className={r.leaderLed === false ? "text-red-700" : ""} />
        <Stat label="Winner ran to" value={r.winnerRanTo?.toFixed(1) ?? ""} sub={winner ? `${winner.runner.horseName}${winner.runner.rank ? `, our #${winner.runner.rank}` : ", not in our four"}${winner.gap !== undefined ? `, ${signed(winner.gap)} on expected` : ""}` : undefined} />
        <Stat label="Vs expected" value={signed(r.bias)} sub="mean gap: how the race ran against what we expected" className={gapClass(r.bias)} />
        <Stat label="Our four" value={r.ourFour !== undefined ? `${r.ourFour} of 4` : ""} sub="of the first four home were in our top four" className={r.ourFour !== undefined ? (r.ourFour >= 3 ? "text-emerald-700" : r.ourFour <= 1 ? "text-red-700" : "") : ""} />
        <Stat label="Top rated" value={topRated ? finish(topRated) : ""} sub={topRated ? `${topRated.runner.horseName}, expected ${topRated.expected.toFixed(1)}${topRated.ranTo !== undefined ? `, ran to ${topRated.ranTo.toFixed(1)}` : ""}` : undefined} className={gapClass(topRated?.gap)} />
        <Stat label="Our calls" value={settled.length ? signed(units, 2) : ""} sub={calls.length ? `${calls.length} ${calls.length === 1 ? "call" : "calls"}, level stakes` : "none"} className={unitsClass(settled.length ? units : undefined)} />
      </div>

      {talking.length > 0 && (
        <div className="card mb-4 text-sm space-y-2">
          {talking.map((t, i) => (
            <p key={i}>
              <span className="badge mr-2">{t.kind}</span>
              <strong>{t.runner.runner.horseName}</strong>: {finish(t.runner).toLowerCase()}{t.runner.sp ? ` at ${price(t.runner.sp)}` : ""}, ran to {t.runner.ranTo?.toFixed(1)} against {t.runner.expected.toFixed(1)} expected. {t.text}
            </p>
          ))}
        </div>
      )}

      {shape.length > 0 && (
        <Section className="mb-4" id={`review-race-shape-${raceId}`} letter="S" title="How it was run" aside={`Front to back as it settled, mapped ${r.race.pace.tempo} and ran ${r.tempo ?? "untimed"}`} defaultOpen={sections}>
          <div className="section-body overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead>
                <tr><th>Horse</th><th>Ours</th><th>Map</th><th className="text-right">Mapped</th><th className="text-right">Settled</th><th className="text-right">800</th><th className="text-right">400</th><th>Result</th><th className="text-right">Early</th><th className="text-right">Last 600</th><th className="text-right">Ran to</th><th className="text-right">Gap</th></tr>
              </thead>
              <tbody>
                {shape.map((x) => (
                  <tr key={x.runner.tabNumber}>
                    <td className="font-semibold">{x.runner.tabNumber}. {x.runner.horseName}</td>
                    <td className="text-xs">{x.runner.signal ? <Tag side={x.runner.signal} prime={x.runner.prime} /> : x.runner.rank ? <span className="text-ink-soft">#{x.runner.rank}</span> : ""}</td>
                    <td className="text-ink-soft">{x.runner.ratings.map}</td>
                    <td className="text-right nums">{x.runner.ratings.ppir || ""}</td>
                    <td className={`text-right nums font-semibold ${settledClass(x)}`}>{x.run!.posSettling}</td>
                    <td className="text-right nums">{x.run?.pos800 ?? ""}</td>
                    <td className="text-right nums">{x.run?.pos400 ?? ""}</td>
                    <td className="nums">{finish(x)}</td>
                    <td className="text-right nums">{signed(x.early)}</td>
                    <td className="text-right nums">{signed(x.late)}{x.ownLast600 ? <span className="text-ink-soft"> {x.ownLast600.toFixed(2)}</span> : ""}</td>
                    <td className="text-right nums">{x.ranTo?.toFixed(1) ?? ""}</td>
                    <td className={`text-right nums ${gapClass(x.gap)}`}>{signed(x.gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section className="mb-4" id={`review-race-ours-${raceId}`} letter="O" title="Our top four and calls" aside="Rated against the market, and how each went" defaultOpen={sections}>
        <div className="section-body overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr><th>#</th><th>Horse</th><th>Call</th><th className="text-right" title={EXPECTED_TIP}>Expected</th><th className="text-right">Rated</th><th className="text-right">Market</th><th className="text-right">Edge</th><th>Result</th><th className="text-right">Ran to</th><th className="text-right" title={GAP_TIP}>Gap</th><th className="text-right" title={TIME_TIP}>Time</th><th className="text-right" title={L600_TIP}>L600</th><th className="text-right" title="Where we mapped the horse to settle, then where it did">Settled</th><th>Why</th></tr>
            </thead>
            <tbody>
              {ours.map((x) => (
                <tr key={x.runner.tabNumber}>
                  <td className="nums">{x.runner.rank}</td>
                  <td className="font-semibold">{x.runner.tabNumber}. {x.runner.horseName}</td>
                  <td>{x.runner.signal ? <Tag side={x.runner.signal} prime={x.runner.prime} /> : ""}</td>
                  <td className="text-right nums">{x.expected.toFixed(1)}</td>
                  <td className="text-right nums">{price(x.runner.ratedPrice)}</td>
                  <td className="text-right nums">{price(x.runner.marketPrice)}</td>
                  <td className="text-right nums">{x.runner.edge !== undefined ? `${signed(x.runner.edge * 100)}%` : ""}</td>
                  <td className="nums">{finish(x)}</td>
                  <td className="text-right nums">{x.ranTo?.toFixed(1) ?? ""}</td>
                  <td className={`text-right nums ${gapClass(x.gap)}`}>{signed(x.gap)}</td>
                  <td className="text-right nums">{clock(x.ownTime)}</td>
                  <td className="text-right nums">{x.ownLast600?.toFixed(2) ?? ""}</td>
                  <td className={`text-right nums ${settledClass(x)}`}>{settledOf(x)}</td>
                  <td className="text-xs text-ink-soft">{x.runner.why ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section className="mb-4" id={`review-race-runners-${raceId}`} letter="E" title="Every runner against its run" aside={`${r.full} of ${r.runners.length} with a full benchmark`} defaultOpen={sections}>
        <div className="section-body overflow-x-auto">
          <RunnerTable r={r} />
        </div>
      </Section>
    </>
  );
}
