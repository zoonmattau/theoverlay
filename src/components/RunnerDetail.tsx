import { Factors } from "./Factors";
import { price, signedPercent } from "@/lib/format";
import type { PublishedRace, PublishedRunner } from "@/lib/model/types";

const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const day = (iso: string) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
const SEX: Record<string, string> = { M: "mare", G: "gelding", H: "horse", C: "colt", F: "filly", R: "rig" };

/** What to expect today, three or four short lines read straight off the ratings. */
function expectations(r: PublishedRunner, race: PublishedRace): string[] {
  const g = r.ratings;
  const out: string[] = [];
  out.push(`Should settle ${g.map === "leader" ? "in front" : g.map === "on pace" ? "on the pace" : g.map}.`);
  const tempo = race.pace.tempo;
  const tempoGap = g.tempo.fast - g.tempo.slow;
  if (tempo === "fast" && tempoGap > 1) out.push("Suited by the fast tempo expected here.");
  else if (tempo === "fast" && tempoGap < -1) out.push("Would rather a softer tempo than this race looks like running.");
  else if (tempo === "slow" && tempoGap < -1) out.push("Suited by the slow tempo expected here.");
  else if (tempo === "slow" && tempoGap > 1) out.push("Wants more pace on than this race looks like having.");
  const goingGap = g.going[race.going] - g.class;
  if (goingGap > 1) out.push(`Better on ${race.going} ground than its class rating says.`);
  else if (goingGap < -1) out.push(`Rates below its class on ${race.going} ground.`);
  const distGap = g.distance - g.class;
  if (distGap > 1) out.push("Has run above its class at this trip.");
  else if (distGap < -1) out.push("Yet to run to its class at this trip.");
  const days = r.horse?.daysSinceLastRun;
  if (r.horse?.firstStarter) out.push("First starter, so the numbers lean on the market and the stable.");
  else if (days && days > 90) out.push(`First up after ${days} days.`);
  else if (days && days <= 10) out.push(`Backing up after ${days} days.`);
  return out.slice(0, 4);
}

/** Our call on the runner in one or two sentences. */
function opinion(r: PublishedRunner): string {
  const rated = price(r.ratedPrice);
  const live = price(r.marketPrice);
  if (!r.marketPrice) return `Rated ${rated}, no market price yet.`;
  if (r.signal === "back") return `Bet. The market has ${live} and we make it ${rated}, an edge of ${signedPercent(r.edge)}.`;
  if (r.signal === "lay") return `Lay. The market has ${live} and we make it ${rated}, so it is under the odds.`;
  if (r.rank && r.rank <= 4) return `No bet. In our top four, but at ${live} against our ${rated} the market has it about right.`;
  if ((r.edge ?? 0) > 0) return `No bet. A touch of value at ${live} against our ${rated}, not enough to act on.`;
  return `No bet. We make it ${rated} and the market has ${live}, so there is no edge.`;
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

export function RunnerDetail({ r, race }: { r: PublishedRunner; race: PublishedRace }) {
  const h = r.horse;
  const runs = r.runs ?? [];
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
        <h4>Last {runs.length || ""} runs</h4>
        {runs.length === 0 ? (
          <p className="text-xs text-ink-soft">No starts yet.</p>
        ) : (
          <table className="runs-table nums">
            <thead>
              <tr><th>Date</th><th>Track</th><th>Dist</th><th>Going</th><th>Class</th><th>Fin</th><th>Mgn</th><th>Wgt</th><th>SP</th><th>Map</th><th className="text-right">Pts</th></tr>
            </thead>
            <tbody>
              {runs.map((x) => (
                <tr key={`${x.date}-${x.track}`}>
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
        <p className={`detail-call ${r.signal === "back" ? "is-back" : r.signal === "lay" ? "is-lay" : ""}`}>{opinion(r)}</p>
        {r.why && <p className="text-xs text-ink-secondary mt-1">{r.why}</p>}
      </div>
    </div>
  );
}
