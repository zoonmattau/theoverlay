import { RankChip } from "./Badge";
import { MAP_LABEL, SignalBadge, TEMPO_LABEL } from "./Ratings";
import { Section } from "./Section";
import type { PublishedRace, PublishedRunner } from "@/lib/model/types";

/**
 * How we expect the race to unfold for our runners: where each settles, how
 * the tempo suits it, and what it has left at the finish.
 */
export function WhatToWatch({ race }: { race: PublishedRace }) {
  const ours = race.runners
    .filter((r) => !r.scratched && (r.rank !== null || r.signal))
    .sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9));
  const tempo = race.pace.tempo;

  return (
    <Section
      id="watch"
      letter="W"
      title="What to watch"
      aside={`${TEMPO_LABEL[tempo]} tempo expected, pressure ${Math.round(race.pace.pressure * 100)}%`}
    >
      <div className="section-body">
        <p className="text-sm mb-3">{race.verdict}</p>
        <div className="overflow-x-auto">
          <table className="data-table text-sm min-w-[720px]">
            <thead>
              <tr>
                <th>Runner</th>
                <th>Settles</th>
                <th>Race speed</th>
                <th>Closing speed</th>
                <th>Expect</th>
              </tr>
            </thead>
            <tbody>
              {ours.map((r) => {
                const e = expect(r, race);
                return (
                  <tr key={r.tabNumber}>
                    <td>
                      <div className="flex items-center gap-2">
                        {r.rank ? <RankChip rank={r.rank} /> : <span className="w-5" />}
                        <span className="font-semibold">
                          {r.tabNumber}. {r.horseName}
                        </span>
                        <span className="text-ink-soft text-xs">(B{r.barrier})</span>
                        <SignalBadge signal={r.signal} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      {MAP_LABEL[r.ratings.map]}
                    </td>
                    <td className="whitespace-nowrap">
                      <Tone tone={e.tempoTone}>{e.tempoText}</Tone>
                    </td>
                    <td className="whitespace-nowrap">
                      <Tone tone={e.closeTone}>{e.closeText}</Tone>
                    </td>
                    <td className="text-ink-secondary">{e.sentence}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

function Tone({ tone, children }: { tone: 1 | 0 | -1; children: React.ReactNode }) {
  const cls = tone > 0 ? "text-accent font-bold" : tone < 0 ? "text-red font-bold" : "text-ink-secondary";
  return <span className={cls}>{children}</span>;
}

/** Points above or below class that count as a real difference. */
const GAP = 1.5;

function expect(r: PublishedRunner, race: PublishedRace) {
  const g = r.ratings;
  const tempo = race.pace.tempo;
  const fit = tempo === "fast" ? g.pressure : tempo === "slow" ? g.tempo.slow : g.class;
  const tempoGap = fit - g.class;
  const closeGap = g.late - g.class;

  const tempoTone: 1 | 0 | -1 = tempoGap >= GAP ? 1 : tempoGap <= -GAP ? -1 : 0;
  const closeTone: 1 | 0 | -1 = closeGap >= GAP ? 1 : closeGap <= -GAP ? -1 : 0;

  const tempoText =
    tempo === "even"
      ? "Suits, even tempo"
      : tempoTone > 0
        ? `Suits the ${tempo} tempo`
        : tempoTone < 0
          ? `Against it, ${tempo} tempo`
          : `Neutral on the ${tempo} tempo`;

  const closeText = closeTone > 0 ? "Strong closer" : closeTone < 0 ? "Flattens late" : "Holds its speed";

  const where =
    g.map === "leader"
      ? "Should lead"
      : g.map === "on pace"
        ? "Settles on the speed"
        : g.map === "midfield"
          ? "Settles midfield"
          : "Goes back";

  const middle =
    tempo === "fast"
      ? g.map === "leader" || g.map === "on pace"
        ? tempoTone >= 0
          ? ", copes with the hot tempo up front"
          : ", and the hot tempo will test it up front"
        : ", and the hot tempo will bring it into it"
      : tempo === "slow"
        ? g.map === "leader" || g.map === "on pace"
          ? ", gets an easy time in front"
          : ", and needs the leaders to come back off a slow tempo"
        : "";

  const end =
    closeTone > 0
      ? " and finishes off hard."
      : closeTone < 0
        ? " but has to be in front early because it does not finish off."
        : " and runs the race out evenly.";

  return { tempoTone, tempoText, closeTone, closeText, sentence: `${where}${middle}${end}` };
}
