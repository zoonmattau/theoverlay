import { Fragment } from "react";

import { BookieLink } from "./BookieLink";
import { Factors } from "./Factors";
import { price } from "@/lib/format";
import { callLine, finishFit, observations, settles, tempoFit } from "@/lib/model/narrative";
import type { PublishedRace, PublishedRun, PublishedRunner } from "@/lib/model/types";

const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const day = (iso: string) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
const SEX: Record<string, string> = { M: "mare", G: "gelding", H: "horse", C: "colt", F: "filly", R: "rig" };

/** What to expect today: position, tempo, finish, then the strongest facts from the form. */
function expectations(r: PublishedRunner, race: PublishedRace): string[] {
  const out: string[] = [`${settles(r)}.`];
  const t = tempoFit(r, race);
  if (t.tone !== 0) out.push(`${t.text}.`);
  const f = finishFit(r, race);
  if (f.tone !== 0) out.push(`${f.text}.`);
  for (const o of observations(r, race).slice(0, 4)) out.push(`${o.text[0].toUpperCase()}${o.text.slice(1)}.`);
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
  const metAny = runs.some((x) => x.met?.length);
  const avg = fieldAverage(race);
  const g = r.ratings;
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
        <p className="detail-facts">
          {[h?.age ? `${h.age}yo` : null, h?.sex ? SEX[h.sex] ?? h.sex : null].filter(Boolean).join(" ") || "—"}
          {h?.sire ? `, by ${h.sire} out of ${h.dam ?? "?"}` : ""}
        </p>
        <p className="detail-facts">
          {r.trainer ?? "—"} / {r.jockey ?? "—"}, barrier {r.barrier}, {r.weight ?? "—"}kg
        </p>
        <dl className="detail-grid">
          <div><dt>Career</dt><dd className="nums">{h?.career ?? "—"}</dd></div>
          <div><dt>Trip</dt><dd className="nums">{h?.distanceForm ?? "—"}</dd></div>
          <div><dt>Track</dt><dd className="nums">{h?.trackForm ?? "—"}</dd></div>
          <div><dt>Last run</dt><dd className="nums">{h?.daysSinceLastRun ? `${h.daysSinceLastRun}d ago` : h?.firstStarter ? "first start" : "—"}</dd></div>
        </dl>
        <p className="detail-facts">
          Gear: {h?.gear?.length ? h.gear.join(", ") : "none"}
          {h?.gearChanges?.length ? <strong>. {h.gearChanges.join(", ")}</strong> : null}
        </p>
      </div>

      <div className="runner-detail-col runner-detail-runs">
        <h4>Last {runs.length || ""} runs{metAny ? ", with today's rivals marked" : ""}</h4>
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
                <th className="tip" data-tip="Weight carried, in kilograms.">Wgt</th>
                <th className="tip" data-tip="Starting price, the odds at the jump.">SP</th>
                <th className="tip" data-tip="Where it sat in the run: leader, on pace, midfield or back.">Settled</th>
                <th className="text-right tip tip-right" data-tip="What we scored the run in benchmark points, from the class and the clock, never the placing.">Pts</th>
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
                  <td>{x.weight ?? "—"}</td>
                  <td>{x.sp ? price(x.sp) : "—"}</td>
                  <td>{x.map ?? "—"}</td>
                  <td className="text-right font-semibold">{x.points.toFixed(1)}</td>
                </tr>
                {x.met?.length && x.finish ? (
                  <tr className="met-row">
                    <td colSpan={11}><Met run={x} race={race} /></td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
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
          {expectations(r, race).slice(0, 4).map((line) => <li key={line}>{line}</li>)}
        </ul>
        <div className="mt-2"><Factors r={r.ratings} compact /></div>
        <h4 className="mt-4">Our call</h4>
        <p className={`detail-call ${r.prime ? "is-prime" : r.signal === "back" ? "is-back" : r.signal === "lay" ? "is-lay" : ""}`}>
          {callLine(r)}
          {r.signal === "back" && r.marketPrice ? <BookieLink codes={r.bookies} raceId={race.raceId} prefix={` Take ${price(r.marketPrice)} at `} className="font-bold" /> : null}
        </p>
      </div>
    </div>
  );
}
