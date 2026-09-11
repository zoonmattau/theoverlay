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

export function RunnerDetail({ r, race }: { r: PublishedRunner; race: PublishedRace }) {
  const h = r.horse;
  const runs = r.runs ?? [];
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
        <h4>What to expect</h4>
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
