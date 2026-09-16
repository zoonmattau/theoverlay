import Link from "next/link";

import type { FeatureLine, PublishedReview, Storyline } from "@/lib/reviews";
import { longDate } from "@/lib/format";

const KIND_LABEL: Record<Storyline["kind"], string> = {
  "run of the day": "Run of the day",
  "under the radar": "Under the radar",
  disappointing: "The disappointment",
  improver: "The improver",
  "on the mark": "On the mark",
};
const KIND_CLASS: Record<Storyline["kind"], string> = {
  "run of the day": "badge-prime",
  "under the radar": "badge-back",
  disappointing: "badge-lay",
  improver: "badge-accent",
  "on the mark": "",
};

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(2)}`;

/** The public Saturday review: the storylines, the features, the day's record. Everything on our scale. */
export function ReviewStory({ review, full = true }: { review: PublishedReview; full?: boolean }) {
  const raceHref = (s: { meetingId: string; raceId: string }) => `/racing/${review.date}/${s.meetingId}/${s.raceId}`;
  const stories = full ? review.storylines : review.storylines.slice(0, 3);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-secondary">{review.intro}</p>

      <ul className="grid gap-3 md:grid-cols-2">
        {stories.map((s, i) => (
          <li key={i} className={`card ${s.kind === "run of the day" ? "border-lime bg-lime-soft md:col-span-2" : ""}`}>
            <span className={`badge ${KIND_CLASS[s.kind]}`}>{KIND_LABEL[s.kind]}</span>
            <p className="mt-2 text-sm leading-relaxed">{s.text}</p>
            {s.kind !== "on the mark" && (
              <Link href={raceHref(s)} className="mt-2 inline-block text-xs underline text-ink-soft">
                {s.track} R{s.raceNumber}
              </Link>
            )}
          </li>
        ))}
      </ul>

      {full && review.features.length > 0 && <Features features={review.features} raceHref={raceHref} />}

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Tile label="Bets" value={String(review.record.bets)} />
        <Tile label="Bets, units" value={units(review.record.betUnits)} tone={review.record.betUnits} />
        <Tile label="Lays" value={String(review.record.lays)} />
        <Tile label="Lays, units" value={units(review.record.layUnits)} tone={review.record.layUnits} />
      </div>
    </div>
  );
}

const price = (n?: number) => (n ? `$${n.toFixed(2)}` : "");
const fin = (n?: number) => (n === undefined ? "to run" : n === 1 ? "Won" : n === 0 ? "DNF" : `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`);

function Features({ features, raceHref }: { features: FeatureLine[]; raceHref: (s: { meetingId: string; raceId: string }) => string }) {
  return (
    <div>
      <h2 className="font-display text-xl font-extrabold">The features</h2>
      <p className="text-xs text-ink-soft mb-3">Every Group race of the day: the first three home, our top four, and how the winner&apos;s run measures on our scale.</p>
      <div className="space-y-3">
        {features.map((f) => (
          <div key={f.raceId} className="card">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="badge badge-prime">{f.grade}</span>
              <Link href={raceHref(f)} className="font-display font-extrabold underline">{f.name}</Link>
              <span className="text-xs text-ink-soft">{f.track} R{f.raceNumber}, {f.distance}m, par {f.par}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed">{f.text}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="overflow-x-auto">
                <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mb-1">The first three</div>
                <table className="data-table w-full text-sm">
                  <thead><tr><th>Fin</th><th>Horse</th><th className="text-right">SP</th><th className="text-right">Our mark</th><th className="text-right">Ran to</th><th className="text-right">Our #</th></tr></thead>
                  <tbody>
                    {f.placings.map((p) => (
                      <tr key={p.finish}>
                        <td className="nums">{p.finish}</td>
                        <td className="font-semibold">{p.horse}</td>
                        <td className="text-right nums">{price(p.sp)}</td>
                        <td className="text-right nums">{p.mark.toFixed(1)}</td>
                        <td className="text-right nums">{p.ranTo?.toFixed(1) ?? ""}</td>
                        <td className="text-right nums">{p.rank ?? <span className="text-ink-soft">out</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto">
                <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mb-1">Our top four</div>
                <table className="data-table w-full text-sm">
                  <thead><tr><th>#</th><th>Horse</th><th className="text-right">Mark</th><th className="text-right">Rated</th><th className="text-right">Market</th><th>Call</th><th>Result</th></tr></thead>
                  <tbody>
                    {f.ourFour.map((x) => (
                      <tr key={x.rank}>
                        <td className="nums">{x.rank}</td>
                        <td className="font-semibold">{x.horse}</td>
                        <td className="text-right nums">{x.mark.toFixed(1)}</td>
                        <td className="text-right nums">{price(x.ratedPrice)}</td>
                        <td className="text-right nums">{price(x.marketPrice)}</td>
                        <td>{x.call === "back" ? <span className="badge badge-back">Bet</span> : x.call === "lay" ? <span className="badge badge-lay">Lay</span> : ""}</td>
                        <td className={`nums ${x.finish === 1 ? "font-bold text-accent" : ""}`}>{fin(x.finish)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {f.calls.length > 0 && (
              <p className="mt-3 text-xs text-ink-soft">
                Our calls: {f.calls.map((c) => `${c.side === "lay" ? "lay" : "bet"} ${c.horse} at ${price(c.marketPrice)}, ${fin(c.finish)}${c.units !== undefined ? ` (${units(c.units)})` : ""}`).join("; ")}.
                {f.units !== undefined && <> Net {units(f.units)} units.</>}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="card py-3">
      <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft">{label}</div>
      <div className={`nums text-2xl font-extrabold ${tone === undefined ? "" : tone > 0 ? "text-accent" : tone < 0 ? "text-red" : ""}`}>{value}</div>
    </div>
  );
}

/** The home page banner while the review is fresh. */
export function ReviewBanner({ review }: { review: PublishedReview }) {
  const lead = review.storylines.find((s) => s.kind === "run of the day") ?? review.storylines[0];
  return (
    <section className="card mt-6 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <span className="badge badge-prime">Saturday review</span>
        <h2 className="mt-1.5 font-display text-xl font-extrabold tracking-tight leading-tight">{longDate(review.date)}: how every runner ran against our numbers.</h2>
        {lead && <p className="mt-1 text-sm text-ink-secondary">{lead.text}</p>}
      </div>
      <Link href={`/review/${review.date}`} className="btn btn-primary">Read the review</Link>
    </section>
  );
}
