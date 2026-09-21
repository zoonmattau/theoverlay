import Link from "next/link";

import { Section } from "./Section";
import { FormDots, units } from "./TipsterCard";
import type { TipsterProfile } from "@/lib/creators";

/**
 * Who's hot and who's not: the best and worst of the last seven days, up
 * to three each, with the run of results beside the name. Only tipsters
 * with something settled in the week are in it.
 */
export function HotAndNot({ profiles, since, className = "" }: { profiles: TipsterProfile[]; /** yyyy-mm-dd a week ago, so the dots are the week's. */ since: string; className?: string }) {
  const week = profiles.filter((p) => p.windows["7"].n > 0);
  const hot = [...week].filter((p) => p.windows["7"].units > 0).sort((a, b) => b.windows["7"].units - a.windows["7"].units).slice(0, 3);
  const not = [...week].filter((p) => p.windows["7"].units < 0).sort((a, b) => a.windows["7"].units - b.windows["7"].units).slice(0, 3);
  return (
    <Section id="hot-not" letter="H" title="Who's hot, who's not" aside="The last seven days" className={className}>
      <div className="section-body">
        {week.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing settled this week yet.</p>
        ) : (
          <div className="hot-not">
            <Column title="Hot" rows={hot} since={since} empty="Nobody in front this week." />
            <Column title="Not" rows={not} since={since} empty="Nobody behind this week." />
          </div>
        )}
      </div>
    </Section>
  );
}

function Column({ title, rows, since, empty }: { title: string; rows: TipsterProfile[]; since: string; empty: string }) {
  return (
    <div>
      <div className="stat-label mb-1">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">{empty}</p>
      ) : (
        rows.map((p) => {
          const w = p.windows["7"];
          return (
            <div key={p.tipster.id} className="hot-not-row">
              <Link href={`/t/${p.tipster.code}`} className="font-display font-extrabold hover:underline">{p.tipster.name}</Link>
              <span className="text-xs text-ink-soft nums">{w.hit} of {w.n}</span>
              <span className="ml-auto"><FormDots recent={p.recent.filter((r) => r.date >= since)} /></span>
              <span className={`nums font-bold ${w.units > 0 ? "text-accent" : "text-red"}`}>{units(w.units)}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
