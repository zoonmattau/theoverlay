import { TipChip } from "./Badge";
import { MAP_LABEL, SignalBadge, TEMPO_LABEL } from "./Ratings";
import { Section } from "./Section";
import { MapHover } from "./MapHover";
import { finishFit, tempoFit, watchSentence } from "@/lib/model/narrative";
import type { PublishedRace } from "@/lib/model/types";

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
        {/* On a phone each runner is a block: the name, three facts as chips, then the sentence. */}
        <ul className="watch-list">
          {ours.map((r) => {
            const t = tempoFit(r, race);
            const f = finishFit(r, race);
            return (
              <li key={r.tabNumber} className="watch-item">
                <div className="flex items-center gap-2 min-w-0">
                  <TipChip r={r} />
                  <span className="font-semibold truncate">
                    {r.tabNumber}. {r.horseName}
                  </span>
                  <span className="text-ink-soft text-xs shrink-0">(B{r.barrier})</span>
                  <SignalBadge signal={r.signal} prime={r.prime} />
                </div>
                <dl className="watch-facts">
                  <div><dt>Settles</dt><dd>{MAP_LABEL[r.ratings.map]}</dd></div>
                  <div><dt>Race speed</dt><dd><Tone tone={t.tone}>{t.text}</Tone></dd></div>
                  <div><dt>Closing</dt><dd><Tone tone={f.tone}>{f.text}</Tone></dd></div>
                </dl>
                <p className="text-sm text-ink-secondary">{watchSentence(r, race)}</p>
              </li>
            );
          })}
        </ul>
        <div className="overflow-x-auto watch-table">
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
                const t = tempoFit(r, race);
                const f = finishFit(r, race);
                return (
                  <tr key={r.tabNumber}>
                    <td>
                      <div className="flex items-center gap-2">
                        <TipChip r={r} />
                        <span className="font-semibold">
                          {r.tabNumber}. {r.horseName}
                        </span>
                        <span className="text-ink-soft text-xs">(B{r.barrier})</span>
                        <SignalBadge signal={r.signal} prime={r.prime} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <MapHover race={race} runner={r}><span className="cursor-help underline decoration-dotted underline-offset-2">{MAP_LABEL[r.ratings.map]}</span></MapHover>
                    </td>
                    <td className="whitespace-nowrap">
                      <Tone tone={t.tone}>{t.text}</Tone>
                    </td>
                    <td className="whitespace-nowrap">
                      <Tone tone={f.tone}>{f.text}</Tone>
                    </td>
                    <td className="text-ink-secondary">{watchSentence(r, race)}</td>
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

function Tone({ tone, children }: { tone: -1 | 0 | 1; children: React.ReactNode }) {
  const cls = tone > 0 ? "text-accent font-bold" : tone < 0 ? "text-red font-bold" : "text-ink-secondary";
  return <span className={cls}>{children}</span>;
}
