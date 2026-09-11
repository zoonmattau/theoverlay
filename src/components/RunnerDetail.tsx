import { Fragment } from "react";

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
  const f = finishFit(r);
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

function SectionalBar({ label, value, avg }: { label: string; value: number; avg: number }) {
  const diff = value - avg;
  const pct = Math.min(100, Math.max(0, 50 + diff * 5));
  return (
    <div className="sec-row">
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
        return (
          <span key={m.tab} className={`met-chip ${beat ? "is-beat" : "is-behind"}`} title={`${other.horseName} is in today's race and finished ${m.finish ? ord(m.finish) : "unplaced"} in this one`}>
            {beat ? "beat" : "behind"} {other.horseName}
            {m.finish ? ` (${ord(m.finish)})` : ""}
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
  const tile = (label: string, value: number) => (
    <div className={`cond-tile ${value - g.class > 1 ? "is-up" : value - g.class < -1 ? "is-down" : ""}`}>
      <span className="nums">{value.toFixed(1)}</span>
      <small>{label}</small>
    </div>
  );
  return (
    <div className="runner-detail">
      <div className="runner-detail-col">
        <h4>Horse</h4>
        <dl className="detail-list">
          <div><dt>Profile</dt><dd>{[h?.age ? `${h.age}yo` : null, h?.sex ? SEX[h.sex] ?? h.sex : null].filter(Boolean).join(" ") || "—"}</dd></div>
          <div><dt>Breeding</dt><dd>{h?.sire ? `${h.sire} × ${h.dam ?? "?"}` : "—"}</dd></div>
          <div><dt>Trainer</dt><dd>{r.trainer ?? "—"}</dd></div>
          <div><dt>Jockey</dt><dd>{r.jockey ?? "—"}</dd></div>
          <div><dt>Barrier / weight</dt><dd className="nums">{r.barrier} / {r.weight ?? "—"}kg</dd></div>
          <div><dt>Career</dt><dd className="nums">{h?.career ?? "—"}</dd></div>
          <div><dt>This trip</dt><dd className="nums">{h?.distanceForm ?? "—"}</dd></div>
          <div><dt>This track</dt><dd className="nums">{h?.trackForm ?? "—"}</dd></div>
          <div><dt>Last run</dt><dd className="nums">{h?.daysSinceLastRun ? `${h.daysSinceLastRun} days ago` : h?.firstStarter ? "first starter" : "—"}</dd></div>
        </dl>
      </div>

      <div className="runner-detail-col runner-detail-runs">
        <h4>Last {runs.length || ""} runs{metAny ? ", with today's rivals marked" : ""}</h4>
        {runs.length === 0 ? (
          <p className="text-xs text-ink-soft">No starts yet.</p>
        ) : (
          <table className="runs-table nums">
            <thead>
              <tr>
                <th>Date</th>
                <th>Track</th>
                <th>Dist</th>
                <th>Going</th>
                <th>Class</th>
                <th title="Finishing position and field size">Fin</th>
                <th title="Lengths beaten">Mgn</th>
                <th>Wgt</th>
                <th title="Starting price">SP</th>
                <th title="Where it settled in the run: leader, on pace, midfield or back">Settled</th>
                <th className="text-right" title="What we scored the run, in benchmark points">Pts</th>
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
                  <td className={x.finish === 1 ? "font-bold text-accent" : ""}>{x.finish ? `${ord(x.finish)}${x.runners ? `/${x.runners}` : ""}` : "—"}</td>
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
          {tile(`${race.going} track`, g.going[race.going])}
          {tile(`${race.distance}m`, g.distance)}
          {tile("this track", g.track)}
          {tile(race.pace.tempo === "fast" ? "fast tempo" : "slow tempo", race.pace.tempo === "fast" ? g.tempo.fast : g.tempo.slow)}
        </div>
        <h4 className="mt-4">What to expect</h4>
        <ul className="detail-lines">
          {expectations(r, race).map((line) => <li key={line}>{line}</li>)}
        </ul>
        <div className="mt-2"><Factors r={r.ratings} compact /></div>
        <h4 className="mt-4">Our call</h4>
        <p className={`detail-call ${r.signal === "back" ? "is-back" : r.signal === "lay" ? "is-lay" : ""}`}>{callLine(r)}</p>
        {r.why && <p className="text-xs text-ink-secondary mt-1">{r.why}</p>}
      </div>
    </div>
  );
}
