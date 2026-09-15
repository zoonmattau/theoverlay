import { Fragment } from "react";

import { BookieLink } from "./BookieLink";
import { Factors } from "./Factors";
import { FormWorm } from "./FormWorm";
import { price } from "@/lib/format";
import { MAP_LABEL } from "./Ratings";
import { callLine, finishFit, observations, settles, tempoFit, type Tone } from "@/lib/model/narrative";
import type { PublishedRace, PublishedRun, PublishedRunner } from "@/lib/model/types";

const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const day = (iso: string) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
/** Faster than the class benchmark reads lime, slower red, within half a length plain. */
const bench = (v: number) => (v >= 0.5 ? "text-accent font-semibold" : v <= -0.5 ? "text-red font-semibold" : "");
const benchTip = (v: number, what: string) => (Math.abs(v) < 0.05 ? `Ran ${what} right on the class benchmark.` : `${Math.abs(v).toFixed(1)} ${Math.abs(v) === 1 ? "length" : "lengths"} ${v > 0 ? "faster" : "slower"} than the class benchmark over ${what}.`);

/** 93.14 as 1:33.14, under a minute as 58.20. */
const clockTime = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}` : s.toFixed(2));

const SEX: Record<string, string> = { M: "mare", G: "gelding", H: "horse", C: "colt", F: "filly", R: "rig" };

/** What to expect today: position, tempo, finish, then the strongest facts from the form, each with a tone. */
function expectations(r: PublishedRunner, race: PublishedRace): { text: string; tone: Tone }[] {
  const out: { text: string; tone: Tone }[] = [{ text: `${settles(r)}.`, tone: 0 }];
  const t = tempoFit(r, race);
  if (t.tone !== 0) out.push({ text: `${t.text}.`, tone: t.tone });
  const f = finishFit(r, race);
  if (f.tone !== 0) out.push({ text: `${f.text}.`, tone: f.tone });
  for (const o of observations(r, race).slice(0, 4)) out.push({ text: `${o.text[0].toUpperCase()}${o.text.slice(1)}.`, tone: o.tone });
  return out.slice(0, 6);
}

/** Field averages for the sectional bars, so a number reads as above or below the race. */
function fieldAverage(race: PublishedRace) {
  const live = race.runners.filter((x) => !x.scratched);
  const avg = (pick: (x: PublishedRunner) => number) => live.reduce((a, x) => a + pick(x), 0) / Math.max(1, live.length);
  return { early: avg((x) => x.ratings.early), mid: avg((x) => x.ratings.mid), late: avg((x) => x.ratings.late), today: avg((x) => x.ratings.today) };
}

const SECTION_WHAT: Record<string, string> = {
  Early: "the first part of its races, how quickly it gets going and where that puts it",
  Mid: "the middle of its races, the cruising speed it holds through the run",
  Late: "the last 600m, what it has left when the race is on",
};

function SectionalBar({ label, value, avg }: { label: string; value: number; avg: number }) {
  const diff = value - avg;
  const pct = Math.min(100, Math.max(0, 50 + diff * 5));
  const verdict =
    diff >= 2 ? "well above this field" : diff >= 0.5 ? "a little above this field" : diff <= -2 ? "well below this field" : diff <= -0.5 ? "a little below this field" : "about the field average";
  const tip = `${label} speed: ${SECTION_WHAT[label]}. Rated ${value.toFixed(1)} against a field average of ${avg.toFixed(1)}, so ${verdict}.`;
  return (
    <div className="sec-row tip" data-tip={tip}>
      <span className="sec-label">{label}</span>
      <span className="sec-track">
        <span className="sec-mid" />
        <span className={`sec-fill ${diff >= 0 ? "is-up" : "is-down"}`} style={diff >= 0 ? { left: "50%", width: `${pct - 50}%` } : { left: `${pct}%`, width: `${50 - pct}%` }} />
      </span>
      <span className={`sec-value nums ${diff > 0.5 ? "text-accent" : diff < -0.5 ? "text-red" : "text-ink-soft"}`}>
        {value.toFixed(1)} <small>{diff >= 0 ? "+" : ""}{diff.toFixed(1)}</small>
      </span>
    </div>
  );
}

/** Who else in today's race was in that run, and how it went. */
function Met({ run, race }: { run: PublishedRun; race: PublishedRace }) {
  if (!run.met?.length || !run.finish) return null;
  const live = race.runners.filter((x) => !x.scratched && x.marketPrice);
  const fav = live.length ? live.reduce((a, b) => ((a.marketPrice ?? 999) <= (b.marketPrice ?? 999) ? a : b)).tabNumber : undefined;
  return (
    <span className="met">
      {run.met.map((m) => {
        const other = race.runners.find((x) => x.tabNumber === m.tab);
        if (!other || other.scratched) return null;
        const beat = m.finish !== undefined && run.finish! < m.finish;
        const gap = m.margin !== undefined && run.margin !== undefined ? Math.abs(m.margin - run.margin) : undefined;
        return (
          <span key={m.tab} className={`met-chip ${beat ? "is-beat" : "is-behind"}`} title={`${other.horseName} is in today's race and finished ${m.finish ? ord(m.finish) : "unplaced"} in this one`}>
            {beat ? "beat" : "behind"} {other.horseName}
            {gap !== undefined ? ` by ${gap < 0.05 ? "a nose" : `${gap.toFixed(1)}L`}` : m.finish ? ` (${ord(m.finish)})` : ""}
            {m.tab === fav ? " · today's fav" : ""}
          </span>
        );
      })}
    </span>
  );
}

export function RunnerDetail({ r, race }: { r: PublishedRunner; race: PublishedRace }) {
  const h = r.horse;
  const runs = r.runs ?? [];
  const avg = fieldAverage(race);
  const g = r.ratings;
  // The points a factor adds to or takes from Today, next to the fact it came from, with the reason on hover.
  const last = runs[0];
  const band = race.going;
  const gap = (v: number) => `${Math.abs(v).toFixed(1)} ${v >= 0 ? "above" : "below"}`;
  const why: Record<keyof typeof g.factors, string> = {
    trainer: r.trainerWin !== undefined ? `The stable has won ${r.trainerWin.toFixed(0)}% of its runners in the last twelve months, against 12% for an average stable.` : "No stable record to go on.",
    jockey: r.jockeyWin !== undefined ? `The rider has won ${r.jockeyWin.toFixed(0)}% of rides in the last twelve months, against 12% for an average rider.` : "No riding record to go on.",
    weight: weightWhy(),
    distance: `Its runs within 200m of ${race.distance}m rate ${g.distance.toFixed(1)}, class ${g.class.toFixed(1)}, so ${gap(g.distance - g.class)}.`,
    track: `Its runs at this track rate ${g.track.toFixed(1)}, class ${g.class.toFixed(1)}, so ${gap(g.track - g.class)}.`,
    going: `Its ${band}-track runs rate ${g.going[band].toFixed(1)}, class ${g.class.toFixed(1)}, so ${gap(g.going[band] - g.class)}. A band with no runs sits at class.`,
    tempo: race.pace.tempo === "even" ? "An even tempo is expected, which favours nobody." : `A ${race.pace.tempo} tempo is expected. Its runs at that tempo rate ${(race.pace.tempo === "fast" ? g.tempo.fast : g.tempo.slow).toFixed(1)}, class ${g.class.toFixed(1)}.`,
    fresh: freshWhy(),
    barrier: `Barrier ${r.barrier}, ${ord(race.runners.filter((x) => !x.scratched && x.barrier < r.barrier).length + 1)} from the rail of ${race.runners.filter((x) => !x.scratched).length} once scratchings are out, for a runner that ${MAP_LABEL[g.map].toLowerCase()}, over ${race.distance}m. ${g.map === "leader" || g.map === "on pace" ? "A wide gate means working early to hold a spot; an inside one saves that." : "Back in the field the draw matters less, though a very wide gate costs cover and a rail draw in a big field can mean being held up."}`,
    market: "Form King's own view of this runner against the rest of the field.",
  };
  function weightWhy(): string {
    const v = g.factors.weight ?? 0;
    const today = r.weight;
    const before = last?.weight;
    const diff = today && before ? today - before : 0;
    const carry = today && before ? `Carries ${today}kg today against ${before}kg last start${Math.abs(diff) >= 0.5 ? `, ${Math.abs(diff).toFixed(1)}kg ${diff > 0 ? "more" : "less"}` : ""}.` : today ? `Carries ${today}kg today.` : "";
    if (v > 0) return `${carry} Less on its back than it has been carrying, and its form reads better at today's weight.`;
    if (v < 0) return `${carry} More on its back than its form was made with, and weight slows a horse down.`;
    return `${carry} About what it has been carrying, so the weight is neither here nor there.`;
  }
  function freshWhy(): string {
    const v = g.factors.fresh ?? 0;
    const days = h?.daysSinceLastRun;
    if (h?.firstStarter) return "A first starter, rated off the field until it has run.";
    const firstUp = Boolean(days && days >= 80);
    const secondUp = !firstUp && v !== 0;
    if (!firstUp && !secondUp) return "Not resuming, so the break is not a factor today.";
    const record = firstUp ? h?.firstUpForm : h?.secondUpForm;
    const rec = record && record !== "0:0-0-0" ? ` Its ${firstUp ? "first" : "second"}-up record is ${record} (starts:wins-seconds-thirds).` : "";
    const lead = firstUp ? `Off for ${days} days.` : "Second up from a break.";
    if (v > 0) return `${lead} It has gone well ${firstUp ? "fresh" : "second up"} before, its runs at this stage of a preparation rate above its class, so the break suits it.${rec}`;
    if (v < 0) return `${lead} It has not gone well ${firstUp ? "fresh" : "second up"} before, its runs at this stage of a preparation rate below its class, so it may need the run.${rec}`;
    return `${lead} Its runs at this stage of a preparation are in line with its class, so the break is neither here nor there.${rec}`;
  }
  const fx = (key: keyof typeof g.factors) => {
    const v = g.factors[key] ?? 0;
    const cls = !v ? "" : v > 0 ? "is-up" : "is-down";
    return <span className={`factor nums ml-1.5 tip cursor-help ${cls}`} data-tip={why[key]}>{v > 0 ? "+" : ""}{v.toFixed(1)}</span>;
  };
  const tile = (label: string, value: number, what: string) => {
    const gap = value - g.class;
    const verdict = gap > 1 ? `above its class rating of ${g.class.toFixed(1)}, a plus today` : gap < -1 ? `below its class rating of ${g.class.toFixed(1)}, a query today` : `in line with its class rating of ${g.class.toFixed(1)}`;
    return (
      <div className={`cond-tile tip ${gap > 1 ? "is-up" : gap < -1 ? "is-down" : ""}`} data-tip={`${what}: rated ${value.toFixed(1)}, ${verdict}.`}>
        <span className="nums">{value.toFixed(1)}</span>
        <small>{label}</small>
      </div>
    );
  };
  return (
    <div className="runner-detail">
      <div className="runner-detail-col">
        <h4>Horse</h4>
        <dl className="detail-list">
          <div><dt>Profile</dt><dd>{[h?.age ? `${h.age}yo` : null, h?.sex ? SEX[h.sex] ?? h.sex : null].filter(Boolean).join(" ") || "—"}</dd></div>
          <div><dt>Breeding</dt><dd>{h?.sire ? `${h.sire} × ${h.dam ?? "?"}` : "—"}</dd></div>
          <div><dt>Trainer</dt><dd>{r.trainer ?? "—"}{fx("trainer")}</dd></div>
          <div><dt>Jockey</dt><dd>{r.jockey ?? "—"}{fx("jockey")}</dd></div>
          <div><dt>Barrier</dt><dd className="nums">{r.barrier}{fx("barrier")}</dd></div>
          <div><dt>Weight</dt><dd className="nums">{r.weight ?? "—"}kg{fx("weight")}</dd></div>
          <div><dt>Career</dt><dd className="nums">{h?.career ?? "—"}<span className="factor is-base nums ml-1.5" title={`Class rating from its runs, the base every factor moves. Today ${g.today.toFixed(1)}.`}>{g.class.toFixed(1)}</span></dd></div>
          <div><dt>This trip</dt><dd className="nums">{h?.distanceForm ?? "—"}{fx("distance")}</dd></div>
          <div><dt>This track</dt><dd className="nums">{h?.trackForm ?? "—"}{fx("track")}</dd></div>
          <div><dt>Last run</dt><dd className="nums">{h?.daysSinceLastRun ? `${h.daysSinceLastRun} days ago` : h?.firstStarter ? "first starter" : "—"}{fx("fresh")}</dd></div>
          <div><dt>Going</dt><dd>{race.goingText ?? race.going}{fx("going")}</dd></div>
          <div><dt>Tempo</dt><dd>{race.pace.tempo}{fx("tempo")}</dd></div>
          <div><dt>Gear</dt><dd>{h?.gear?.length ? h.gear.join(", ") : "none"}</dd></div>
          {h?.gearChanges?.length ? (
            <div><dt>Gear change</dt><dd className="font-bold">{h.gearChanges.join(", ")}</dd></div>
          ) : null}
        </dl>
      </div>

      <div className="runner-detail-col runner-detail-runs">
        <h4>Last {runs.length || ""} runs</h4>
        {runs.length === 0 ? (
          <p className="text-xs text-ink-soft">No starts yet.</p>
        ) : (
          <table className="runs-table nums">
            <thead>
              <tr>
                <th className="tip" data-tip="When the race was run, most recent first.">Date</th>
                <th className="tip" data-tip="Where it ran.">Track</th>
                <th className="tip" data-tip="Race distance in metres.">Dist</th>
                <th className="tip" data-tip="Track condition that day: Firm 1-2, Good 3-4, Soft 5-7, Heavy 8-10.">Going</th>
                <th className="tip" data-tip="The grade of the race: benchmark, class, maiden, listed or group.">Class</th>
                <th className="tip" data-tip="Where it finished and the field size. Hover a result for the first four home.">Fin</th>
                <th className="tip" data-tip="Lengths behind the winner.">Mgn</th>
                <th className="tip" data-tip="The horse's own time for the race.">Time</th>
                <th className="tip" data-tip="Its last 600m.">L600</th>
                <th className="tip" data-tip="Weight carried, in kilograms.">Wgt</th>
                <th className="tip" data-tip="Starting price, the odds at the jump.">SP</th>
                <th className="tip" data-tip="Where it sat in the run: leader, on pace, midfield or back.">Settled</th>
                <th className="text-right tip tip-right" data-tip="What we scored the run in benchmark points, from the class and the clock.">Pts</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((x) => (
                <Fragment key={`${x.date}-${x.track}`}>
                <tr>
                  <td>{day(x.date)}</td>
                  <td className="truncate max-w-[110px]">{x.track ?? "—"}</td>
                  <td>{x.distance}</td>
                  <td>{x.going ?? "—"}</td>
                  <td>{x.className ?? "—"}</td>
                  <td className={x.finish === 1 ? "font-bold text-accent" : ""}>
                    {x.finish ? (
                      <span
                        className={x.placings?.length ? "tip cursor-help underline decoration-dotted underline-offset-2" : ""}
                        data-tip={x.placings?.length ? x.placings.map((pl) => `${ord(pl.pos)} ${pl.horse}${pl.margin ? ` ${pl.margin.toFixed(1)}L` : ""}${pl.weight ? ` ${pl.weight}kg` : ""}`).join("  ·  ") : undefined}
                      >
                        {ord(x.finish)}{x.runners ? `/${x.runners}` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{x.margin !== undefined ? (x.finish === 1 ? "won" : `${x.margin.toFixed(1)}L`) : "—"}</td>
                  <td>{x.time ? <span className={x.vsBench !== undefined ? `tip cursor-help ${bench(x.vsBench)}` : ""} data-tip={x.vsBench !== undefined ? benchTip(x.vsBench, "the race") : undefined}>{clockTime(x.time)}</span> : "—"}</td>
                  <td>{x.last600 ? <span className={x.vsBench600 !== undefined ? `tip cursor-help ${bench(x.vsBench600)}` : ""} data-tip={x.vsBench600 !== undefined ? benchTip(x.vsBench600, "the last 600") : undefined}>{x.last600.toFixed(2)}</span> : "—"}</td>
                  <td>{x.weight ?? "—"}</td>
                  <td>{x.sp ? price(x.sp) : "—"}</td>
                  <td>{x.map ?? "—"}</td>
                  <td className="text-right font-semibold">{x.points.toFixed(1)}</td>
                </tr>
                {x.met?.length && x.finish ? (
                  <tr className="met-row">
                    <td colSpan={13}><Met run={x} race={race} /></td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        {runs.length > 0 && (
          <>
            <h4 className="mt-4">Against the field, run by run</h4>
            <FormWorm race={race} runner={r} />
          </>
        )}
      </div>

      <div className="runner-detail-col">
        <h4>Sectionals against the field</h4>
        <div className="sec-bars">
          <SectionalBar label="Early" value={g.early} avg={avg.early} />
          <SectionalBar label="Mid" value={g.mid} avg={avg.mid} />
          <SectionalBar label="Late" value={g.late} avg={avg.late} />
        </div>
        <div className="cond-tiles">
          {tile(`${race.going} track`, g.going[race.going], `Its record on ${race.going} ground`)}
          {tile(`${race.distance}m`, g.distance, `Its record within 200m of today's ${race.distance}m`)}
          {tile("this track", g.track, "Its record at this track")}
          {tile(race.pace.tempo === "fast" ? "fast tempo" : "slow tempo", race.pace.tempo === "fast" ? g.tempo.fast : g.tempo.slow, `Its record in ${race.pace.tempo}-run races, which is what we expect today`)}
        </div>
        <h4 className="mt-4">What to expect</h4>
        <ul className="detail-lines">
          {expectations(r, race).slice(0, 4).map((line) => <li key={line.text} className={line.tone > 0 ? "is-up" : line.tone < 0 ? "is-down" : ""}>{line.text}</li>)}
        </ul>
        <div className="mt-2"><Factors r={r.ratings} compact /></div>
        <h4 className="mt-4">Our call</h4>
        <p className={`detail-call ${r.prime ? "is-prime" : r.signal === "back" ? "is-back" : r.signal === "lay" ? "is-lay" : ""}`}>
          {callLine(r)}
          {r.signal === "back" && r.marketPrice ? <BookieLink codes={r.bookies} raceId={race.raceId} prefix={`Take ${price(r.marketPrice)} at `} className="block mt-1 font-bold" /> : null}
        </p>
      </div>
    </div>
  );
}
