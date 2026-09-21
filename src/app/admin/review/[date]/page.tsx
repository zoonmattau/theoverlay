import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Section } from "@/components/Section";
import { canReview, isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { buildReview, type LedgerRow, type Review, type ReviewedRace, type ReviewedRunner } from "@/lib/model/review";
import { readPublishedReview } from "@/lib/reviews";
import { ClickRow } from "../ClickRow";
import { FetchButton } from "../FetchButton";
import { PublishButton } from "../PublishButton";
import { clock, dayLabel as label, EXPECTED_TIP, finish, GAP_TIP, gapClass, L600_TIP, price, raceLabel, reviewHref, settledClass, settledOf, signed, stageOf, tempoClass, tempoOf, TIME_TIP, unitsClass } from "../shared";

export const metadata: Metadata = { title: "Weekly review", robots: { index: false } };
/** A fetch batch runs for minutes. */
export const maxDuration = 300;

export default function Page({ params }: PageProps<"/admin/review/[date]">) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Day params={params} />
      </Suspense>
    </div>
  );
}

/** The sections in page order, for the jump bar. */
const JUMPS: [string, string][] = [
  ["review-talking", "Talking points"],
  ["review-meetings", "By meeting"],
  ["review-features", "Features"],
  ["review-our-bets", "Bets"],
  ["review-our-lays", "Lays"],
  ["review-ranking", "Strength"],
  ["review-runs", "Runs"],
  ["review-races", "Races"],
];

async function Day({ params }: { params: PageProps<"/admin/review/[date]">["params"] }) {
  const viewer = await getViewer();
  if (!(await canReview(viewer))) notFound();
  const admin = isAdmin(viewer);
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const [review, published] = await Promise.all([buildReview(date), readPublishedReview(date)]);
  if (!review) notFound();
  const c = review.counts;
  const resulted = review.races.some((r) => r.race.result?.length);
  const counts: Record<string, number> = {
    "review-talking": review.talking.length,
    "review-features": review.features.length,
    "review-meetings": review.meetings.filter((m) => m.full > 0).length,
    "review-our-bets": review.bets.length,
    "review-our-lays": review.lays.length,
    "review-ranking": review.ranking.length,
    "review-races": review.races.filter((r) => r.wanted).length,
  };

  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.1em] text-ink-soft font-bold"><Link href="/admin/review" className="underline">Weekly review</Link></p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{label(date)}</h1>
          {/* The tally only matters while there is something left to buy. */}
          {admin && c.missing > 0 && (
            <p className="mt-1 text-sm text-ink-soft">
              {c.wanted} runners wanted: every NSW and VIC runner plus the ten best bets and ten best lays. {c.fetched} fetched, {c.missing} to go, {c.credits} credits spent.
            </p>
          )}
        </div>
        {admin && (
          <div className="flex flex-wrap items-center gap-3">
            {resulted ? <FetchButton date={date} missing={c.missing} partial={c.partial} callsMissing={c.callsMissing} /> : <span className="text-sm text-ink-soft">Nothing has run yet.</span>}
          </div>
        )}
      </section>

      {c.fetched === 0 ? (
        <div className="card text-sm text-ink-soft">
          {admin ? "Fetch the runs once the meetings are done." : "The runs for this day are not in yet. NSW, VIC and WA are in by Monday, QLD and SA later in the week."}{" "}
          {admin && <>Fetch the runs once the meetings are done.</>} The calls alone are enough for the bets and lays ledgers; the full fetch adds every NSW and VIC runner for the talking points and meeting stats. NSW, VIC and WA metro benchmarks are complete by Monday; QLD and SA take most of the week, so refetch those later.
        </div>
      ) : (
        <>
          <nav className="sticky top-0 z-30 -mx-4 px-4 py-2 mb-4 bg-bg border-b border-line flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Sections">
            {JUMPS.filter(([id]) => id === "review-runs" || counts[id]).filter(([id]) => admin || id !== "review-publish").map(([id, name]) => (
              <a key={id} href={`#${id}`} className="font-semibold hover:underline whitespace-nowrap">
                {name}
                {counts[id] !== undefined && <span className="nums text-ink-soft font-normal ml-1">{counts[id]}</span>}
              </a>
            ))}
          </nav>
          <Talking review={review} />
          <Meetings review={review} />
          <Features review={review} />
          <Ledger title="Our bets" rows={review.bets} date={date} />
          <Ledger title="Our lays" rows={review.lays} date={date} />
          <Ranking review={review} />
          <Section className="mb-4" id="review-runs" letter="W" title="Runs of the day" aside="Best against class, and the fastest last 600" defaultOpen={false}>
            <div className="section-body grid gap-4 lg:grid-cols-2">
              <Runs title="Best runs against class" rows={review.best} date={date} />
              <Runs title="Fastest last 600 against class" rows={review.closers} date={date} late />
            </div>
          </Section>
          <Races review={review} />
          {admin && <Section className="mb-4" id="review-publish" letter="P" title="Telling it" aside="The story for the camera, and the public review" defaultOpen={false}>
            <div className="section-body flex flex-wrap items-center gap-3">
              <Link href={`/admin/review/${date}/story`} className="btn btn-secondary btn-sm">The story, race by race</Link>
              <Link href={`/admin/review/${date}/preview`} className="btn btn-secondary btn-sm">Preview the public review</Link>
              <PublishButton date={date} published={published?.publishedAt} />
            </div>
          </Section>}
        </>
      )}
    </>
  );
}

/** A short chip for a call, so ledger rows stay one line tall. */
function Chip({ tag, side, prime }: { tag?: string; side: "back" | "lay"; prime?: boolean }) {
  if (side === "lay") return <span className="badge badge-lay">Lay</span>;
  if (tag === "top_overlay") return <span className="badge badge-prime" title="Overlay of the Day">OOTD</span>;
  if (prime || tag === "prime_overlay") return <span className="badge badge-prime">Prime</span>;
  if (tag === "long_overlay") return <span className="badge badge-back">Long</span>;
  return <span className="badge badge-back">Bet</span>;
}

function Ledger({ title, rows, date }: { title: string; rows: LedgerRow[]; date: string }) {
  const settled = rows.filter((r) => r.units !== undefined);
  const units = settled.reduce((a, r) => a + (r.units ?? 0), 0);
  const won = settled.filter((r) => (r.units ?? 0) > 0).length;
  const rel = rows.map((r) => r.relGap).filter((g): g is number => g !== undefined);
  const meanRel = rel.length ? rel.reduce((a, b) => a + b, 0) / rel.length : undefined;
  return (
    <Section
      className="mb-4"
      id={`review-${title.toLowerCase().replace(/\s+/g, "-")}`}
      letter={title.includes("lay") ? "L" : "B"}
      title={title}
      aside={`${rows.length} calls, ${won} of ${settled.length} won, ${signed(units)}u${meanRel !== undefined ? `, ran ${signed(meanRel)} against their place in our order on average` : ""}`}
      defaultOpen={false}
    >
      <div className="section-body overflow-x-auto">
        <table className="data-table w-full text-sm whitespace-nowrap">
          <thead>
            <tr>
              <th>Race</th><th>Horse</th><th>Call</th>
              <th className="text-right">Edge</th><th className="text-right" title={EXPECTED_TIP}>Expected</th><th className="text-right">Rated</th><th className="text-right">Market</th><th className="text-right">SP</th>
              <th>Result</th><th className="text-right">Ran to</th><th className="text-right" title={GAP_TIP}>Gap</th><th className="text-right" title={TIME_TIP}>Time</th><th className="text-right" title={L600_TIP}>L600</th><th className="text-right">Units</th><th title="The tempo we mapped, then the one the leader set">Tempo</th><th className="text-right" title="Where we mapped the horse to settle, then where it did">Settled</th><th>Data</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <ClickRow key={`${r.race.raceId}:${r.runner.tabNumber}`} href={`/admin/review/${date}/${r.race.raceId}`}>
                <td><Link href={`/admin/review/${date}/${r.race.raceId}`} className="underline">{r.meeting.track} R{r.race.raceNumber}</Link></td>
                <td className="font-semibold">{r.runner.horseName}</td>
                <td><Chip tag={r.tag} side={r.side} prime={r.runner.prime} /></td>
                <td className="text-right nums">{r.runner.edge !== undefined ? `${signed(r.runner.edge * 100, 0)}%` : ""}</td>
                <td className="text-right nums">{r.expected.toFixed(1)}</td>
                <td className="text-right nums">{price(r.runner.ratedPrice)}</td>
                <td className="text-right nums">{price(r.runner.marketPrice)}</td>
                <td className="text-right nums">{price(r.sp)}</td>
                <td className="nums">{finish(r)}</td>
                <td className="text-right nums">{r.ranTo?.toFixed(1) ?? ""}</td>
                <td className={`text-right nums ${gapClass(r.gap)}`}>{signed(r.gap)}</td>
                <td className="text-right nums">{clock(r.ownTime)}</td>
                <td className="text-right nums">{r.ownLast600?.toFixed(2) ?? ""}</td>
                <td className={`text-right nums ${unitsClass(r.units)}`}>{signed(r.units, 2)}</td>
                <td className={tempoClass(r.reviewed)}>{tempoOf(r.reviewed)}</td>
                <td className={`text-right nums ${settledClass(r)}`}>{settledOf(r)}</td>
                <td className="text-ink-soft text-xs">{stageOf(r)}</td>
              </ClickRow>
            ))}
            {rows.length === 0 && <tr><td colSpan={17} className="text-ink-soft">None on the card.</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Features({ review }: { review: Review }) {
  if (review.features.length === 0) return null;
  return (
    <Section className="mb-4" id="review-features" letter="G" title="Feature races" aside="Every Group race of the day: who won, where we had it, and how our calls went">
      <div className="section-body overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr><th>Grade</th><th>Race</th><th>Winner</th><th className="text-right">Our #</th><th className="text-right">Ran to</th><th className="text-right" title="The winner's ran to against its expected mark">+/-</th><th>Our top rated, and its +/-</th><th>Placings, expected</th><th>Our calls</th><th className="text-right">Units</th><th className="text-right">Strength</th><th className="text-right" title="Mean gap over the benchmarked runners: how the race ran against what we expected">Vs expected</th><th className="text-right">Data</th></tr>
          </thead>
          <tbody>
            {review.features.map((f) => (
              <ClickRow key={f.race.race.raceId} href={reviewHref(f.race, review.date)}>
                <td className="font-semibold whitespace-nowrap">{f.grade}</td>
                <td className="min-w-56">
                  <Link href={reviewHref(f.race, review.date)} className="underline font-semibold whitespace-nowrap">{raceLabel(f.race)}</Link>
                  <div className="text-xs text-ink-soft">{f.race.race.name}, {f.race.race.distance}m</div>
                </td>
                <td className="font-semibold whitespace-nowrap">{f.winner ? f.winner.runner.horseName : "—"}{f.winner?.sp ? <span className="text-ink-soft font-normal"> {price(f.winner.sp)}</span> : ""}</td>
                <td className="text-right nums">{f.winner?.runner.rank ?? <span className="text-ink-soft">out</span>}</td>
                <td className="text-right nums">{f.winner?.ranTo?.toFixed(1) ?? ""}</td>
                <td className={`text-right nums ${gapClass(f.winner?.gap)}`}>{signed(f.winner?.gap)}</td>
                <td className="whitespace-nowrap">{f.topRated ? <>{f.topRated.runner.horseName} <span className="nums text-ink-soft">{f.topRated.expected.toFixed(1)}</span>, {finish(f.topRated) || "to run"}{f.topRated.gap !== undefined ? <span className={`nums ${gapClass(f.topRated.gap)}`}> {signed(f.topRated.gap)}</span> : ""}</> : ""}</td>
                <td className="text-xs">{f.placings.map((p) => <div key={p.finish} className="whitespace-nowrap">{p.finish}. {p.runner.horseName} <span className="nums text-ink-soft">{p.expected.toFixed(1)}</span></div>)}</td>
                <td className="text-xs">{f.calls.length ? f.calls.map((x) => <div key={x.runner.tabNumber} className="whitespace-nowrap">{x.runner.signal === "lay" ? "Lay" : "Bet"} {x.runner.horseName}, {finish(x)}</div>) : <span className="text-ink-soft">none</span>}</td>
                <td className={`text-right nums ${unitsClass(f.units)}`}>{f.units !== undefined ? signed(f.units, 2) : ""}</td>
                <td className="text-right nums whitespace-nowrap">{f.race.strength !== undefined ? `${signed(f.race.strength)}L` : ""}</td>
                <td className={`text-right nums ${gapClass(f.race.bias)}`}>{signed(f.race.bias)}</td>
                <td className="text-right nums">{f.race.full}/{f.race.runners.length}</td>
              </ClickRow>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

const KIND_CLASS: Record<string, string> = {
  "run of the day": "badge-prime",
  "under the radar": "badge-back",
  disappointing: "badge-lay",
  improver: "badge-accent",
};

function Talking({ review }: { review: Review }) {
  if (review.talking.length === 0) return null;
  return (
    <Section className="mb-4" id="review-talking" letter="T" title="Talking points" aside="Over the runs with a full benchmark, leaving out races whose benchmark cannot be trusted">
      <div className="section-body overflow-x-auto">
        <table className="data-table w-full text-sm whitespace-nowrap">
          <thead>
            <tr>
              <th></th><th>Horse</th><th>Race</th><th>Result</th><th className="text-right">SP</th>
              <th className="text-right" title="Lengths against the class benchmark over the whole race">Vs class</th>
              <th className="text-right">Ran to</th><th className="text-right" title={EXPECTED_TIP}>Expected</th><th className="text-right" title={GAP_TIP}>Gap</th>
              <th className="text-right" title="The gap with the race's own level taken out: how the horse ran against its place in our order">Vs field</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {review.talking.map((t, i) => {
              const r = t.runner;
              return (
                <ClickRow key={i} href={reviewHref(r.race, review.date)}>
                  <td><span className={`badge ${KIND_CLASS[t.kind] || "badge-muted"}`}>{t.kind}</span></td>
                  <td className="font-semibold">{r.runner.horseName}{r.runner.rank ? <span className="text-ink-soft font-normal text-xs"> #{r.runner.rank}</span> : ""}</td>
                  <td><Link href={reviewHref(r.race, review.date)} className="underline">{raceLabel(r.race)}</Link></td>
                  <td className="nums">{finish(r)}</td>
                  <td className="text-right nums">{price(r.sp)}</td>
                  <td className="text-right nums">{r.run?.vsClass !== undefined ? `${signed(r.run.vsClass)}L` : ""}</td>
                  <td className="text-right nums">{r.ranTo?.toFixed(1) ?? ""}</td>
                  <td className="text-right nums">{r.expected.toFixed(1)}</td>
                  <td className={`text-right nums ${gapClass(r.gap)}`}>{signed(r.gap)}</td>
                  <td className={`text-right nums ${gapClass(r.relGap)}`}>{signed(r.relGap)}</td>
                  <td className="text-xs text-ink-soft whitespace-normal min-w-64">{t.text}</td>
                </ClickRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Meetings({ review }: { review: Review }) {
  const withData = review.meetings.filter((m) => m.full > 0);
  const without = review.meetings.filter((m) => m.full === 0);
  return (
    <Section className="mb-4" id="review-meetings" letter="M" title="By meeting" aside="How each meeting ran against what we expected, where the winners settled, and how our order matched the run">
      <div className="section-body overflow-x-auto">
        <table className="data-table w-full text-sm whitespace-nowrap">
          <thead>
            <tr><th>Meeting</th><th className="text-right">Races</th><th className="text-right" title="Runners with a full benchmark">Bench</th><th className="text-right" title="Mean gap: how the meeting ran against what we expected">Vs exp</th><th className="text-right" title="Mean size of the gap, either way: how far the runs scattered around our expected marks">Scatter</th><th className="text-right" title="Mean size of the gap after the race's own level is taken out">Vs field</th><th className="text-right" title="Correlation of expected with ran to, 1 is perfect">Fit</th><th className="text-right" title="Where the winners settled in the run, on average: 1 is the lead">Win pos</th><th className="text-right" title="Where the first three home settled in the run, on average">Place pos</th><th className="text-right" title="Winners that sat in our top four">Win in 4</th><th className="text-right" title="Races our top rated won">Top won</th><th className="text-right" title="Of the first three home, how many sat in our top four">Top 4 placed</th><th className="text-right">Bets</th><th className="text-right">Lays</th></tr>
          </thead>
          <tbody>
            {withData.map((m) => {
              const share = m.runners ? Math.round((100 * m.full) / m.runners) : 0;
              return (
                <ClickRow key={m.meeting.meetingId} href={`#m-${m.meeting.meetingId}`} className={share < 50 ? "text-ink-soft" : ""}>
                  <td className="font-semibold"><a href={`#m-${m.meeting.meetingId}`} className="underline">{m.meeting.track}</a> <span className="text-ink-soft font-normal text-xs">{m.meeting.state}</span></td>
                  <td className="text-right nums">{m.races}</td>
                  <td className="text-right nums">{m.full}/{m.runners} <span className="text-ink-soft">({share}%)</span></td>
                  <td className={`text-right nums ${gapClass(m.bias)}`}>{signed(m.bias)}</td>
                  <td className="text-right nums">{m.spread?.toFixed(1) ?? ""}</td>
                  <td className="text-right nums">{m.relSpread?.toFixed(1) ?? ""}</td>
                  <td className="text-right nums">{m.fit?.toFixed(2) ?? ""}</td>
                  <td className="text-right nums">{m.winnerSettled?.toFixed(1) ?? ""}</td>
                  <td className="text-right nums">{m.placedSettled?.toFixed(1) ?? ""}</td>
                  <td className="text-right nums">{m.resulted ? `${m.winnersInFour}/${m.resulted}` : ""}</td>
                  <td className="text-right nums">{m.resulted ? `${m.topRatedWon}/${m.resulted}` : ""}</td>
                  <td className="text-right nums">{m.placed ? `${m.placedInFour}/${m.placed}` : ""}</td>
                  <td className={`text-right nums ${unitsClass(m.betUnits)}`}>{m.bets ? `${m.bets} · ${signed(m.betUnits, 2)}` : ""}</td>
                  <td className={`text-right nums ${unitsClass(m.layUnits)}`}>{m.lays ? `${m.lays} · ${signed(m.layUnits, 2)}` : ""}</td>
                </ClickRow>
              );
            })}
          </tbody>
        </table>
      </div>
      {without.length > 0 && (
        <p className="px-4 pb-4 text-xs text-ink-soft">
          No benchmarks yet: {without.map((m) => `${m.meeting.track} (${m.bets ? `${m.bets} bets ${signed(m.betUnits, 2)}` : "no bets"}${m.lays ? `, ${m.lays} lays ${signed(m.layUnits, 2)}` : ""})`).join(", ")}.
        </p>
      )}
    </Section>
  );
}

function Ranking({ review }: { review: Review }) {
  return (
    <Section className="mb-4" id="review-ranking" letter="S" title="Races by how strongly they were run" aside="Strength is the first three home against the class benchmark, in lengths; tempo is the leader's first section against class" defaultOpen={false}>
      <div className="section-body overflow-x-auto">
        <table className="data-table w-full text-sm whitespace-nowrap">
          <thead>
            <tr><th>#</th><th>Race</th><th>Class</th><th className="text-right">Par</th><th className="text-right">Strength</th><th className="text-right">Winner ran to</th><th>Winner</th><th>Tempo</th><th className="text-right">Leader early</th><th>Our call</th><th className="text-right">Data</th></tr>
          </thead>
          <tbody>
            {review.ranking.map((r, i) => {
              const winner = r.runners.find((x) => x.finish === 1);
              const ours = r.runners.filter((x) => x.runner.signal);
              return (
                <ClickRow key={r.race.raceId} href={reviewHref(r, review.date)}>
                  <td className="nums">{i + 1}</td>
                  <td><Link href={reviewHref(r, review.date)} className="underline">{raceLabel(r)}</Link> <span className="text-ink-soft">{r.race.name}</span></td>
                  <td>{r.race.className ?? ""} {r.race.distance}m</td>
                  <td className="text-right nums">{r.race.classPoints}</td>
                  <td className="text-right nums font-semibold">{signed(r.strength)}L{r.suspect && <span className="badge badge-lay ml-1">suspect</span>}</td>
                  <td className="text-right nums">{r.winnerRanTo?.toFixed(1) ?? ""}</td>
                  <td>{winner ? `${winner.runner.tabNumber}. ${winner.runner.horseName}` : ""}{winner?.runner.rank ? <span className="text-ink-soft"> (our #{winner.runner.rank})</span> : ""}</td>
                  <td>{r.tempo ?? ""}</td>
                  <td className="text-right nums">{signed(r.leaderEarly)}L</td>
                  <td className="text-xs">{ours.map((x) => `${x.runner.signal === "lay" ? "Lay" : "Bet"} ${x.runner.horseName} ${finish(x)}`).join(", ")}</td>
                  <td className="text-right nums">{r.full}/{r.runners.length}</td>
                </ClickRow>
              );
            })}
            {review.ranking.length === 0 && <tr><td colSpan={11} className="text-ink-soft">No race has a benchmarked placegetter yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Runs({ title, rows, date, late }: { title: string; rows: (ReviewedRunner & { race: ReviewedRace })[]; date: string; late?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <h3 className="font-semibold text-sm mb-2">{title}</h3>
      <table className="data-table w-full text-sm whitespace-nowrap">
        <thead>
          <tr><th>Horse</th><th>Race</th><th>Result</th><th className="text-right">{late ? "Last 600" : "Vs class"}</th><th className="text-right">Ran to</th><th className="text-right">Mark</th><th className="text-right">Vs field</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ClickRow key={`${r.race.race.raceId}:${r.runner.tabNumber}`} href={reviewHref(r.race, date)}>
              <td className="font-semibold">{r.runner.horseName}{r.runner.signal ? <span className="text-ink-soft text-xs"> {r.runner.signal === "lay" ? "lay" : "bet"}</span> : ""}</td>
              <td><Link href={reviewHref(r.race, date)} className="underline">{raceLabel(r.race)}</Link></td>
              <td className="nums">{finish(r)}</td>
              <td className="text-right nums font-semibold">{signed(late ? r.late : r.run?.vsClass)}L{late && r.ownLast600 ? <span className="text-ink-soft font-normal"> {r.ownLast600.toFixed(2)}s</span> : ""}</td>
              <td className="text-right nums">{r.ranTo?.toFixed(1) ?? ""}</td>
              <td className="text-right nums">{r.expected.toFixed(1)}</td>
              <td className={`text-right nums ${gapClass(r.gap)}`}>{signed(r.gap)}</td>
            </ClickRow>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="text-ink-soft">Nothing benchmarked yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Races({ review }: { review: Review }) {
  const meetings = new Map<string, ReviewedRace[]>();
  for (const r of review.races) {
    if (!r.wanted) continue;
    const list = meetings.get(r.meeting.meetingId) ?? [];
    list.push(r);
    meetings.set(r.meeting.meetingId, list);
  }
  const order = new Map(review.meetings.map((m, i) => [m.meeting.meetingId, i]));
  return (
    <Section className="mb-4" id="review-races" letter="R" title="Races by meeting" aside="Open a meeting, then click a race for the race as a whole">
      <div className="section-body">
      {[...meetings.values()]
        .sort((a, b) => (order.get(a[0].meeting.meetingId) ?? 99) - (order.get(b[0].meeting.meetingId) ?? 99))
        .map((races) => {
          const full = races.reduce((a, r) => a + r.full, 0);
          const total = races.reduce((a, r) => a + r.runners.length, 0);
          return (
            <details key={races[0].meeting.meetingId} id={`m-${races[0].meeting.meetingId}`} className="mb-2 scroll-mt-24 group" open={full > 0 && full >= total * 0.8}>
              <summary className="cursor-pointer flex flex-wrap items-baseline justify-between gap-3 py-2 border-b border-line">
                <span className="font-display font-extrabold">
                  <span className="inline-block w-4 text-ink-soft group-open:rotate-90 transition-transform">›</span> {races[0].meeting.track} <span className="text-ink-soft font-normal text-sm">{races[0].meeting.state}, {races.length} races</span>
                </span>
                <span className={`nums text-sm ${full === 0 ? "text-ink-soft" : full >= total * 0.8 ? "text-accent font-semibold" : "text-amber-700"}`}>{full} of {total} runners benchmarked</span>
              </summary>
              <div className="overflow-x-auto py-2">
                <table className="data-table w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr><th>Race</th><th>Class</th><th className="text-right">Par</th><th className="text-right">Strength</th><th>Tempo</th><th className="text-right">Leader early</th><th>Winner</th><th className="text-right">Ran to</th><th className="text-right" title="Mean gap: how the race ran against what we expected">Vs expected</th><th className="text-right" title="How many of the first four home sat in our top four">Our four</th><th>Our calls</th><th className="text-right">Data</th></tr>
                  </thead>
                  <tbody>
                    {races.map((r) => {
                      const winner = r.runners.find((x) => x.finish === 1);
                      const ours = r.runners.filter((x) => x.runner.signal);
                      return (
                        <ClickRow key={r.race.raceId} href={reviewHref(r, review.date)}>
                          <td><Link href={reviewHref(r, review.date)} className="underline font-semibold">R{r.race.raceNumber}</Link> <span className="text-ink-soft">{r.race.name}</span></td>
                          <td>{r.race.className ?? ""} {r.race.distance}m</td>
                          <td className="text-right nums">{r.race.classPoints}</td>
                          <td className="text-right nums font-semibold">{r.strength !== undefined ? `${signed(r.strength)}L` : ""}{r.suspect && <span className="badge badge-lay ml-1" title="The first three all ran five lengths above class, or a runner has a 200m sector no horse could run: the timing, not the horses">suspect</span>}</td>
                          <td>{r.tempo ?? ""}</td>
                          <td className="text-right nums">{r.leaderEarly !== undefined ? `${signed(r.leaderEarly)}L` : ""}</td>
                          <td>{winner ? `${winner.runner.tabNumber}. ${winner.runner.horseName}` : ""}{winner?.runner.rank ? <span className="text-ink-soft"> (our #{winner.runner.rank})</span> : ""}</td>
                          <td className="text-right nums">{r.winnerRanTo?.toFixed(1) ?? ""}</td>
                          <td className={`text-right nums ${gapClass(r.bias)}`}>{signed(r.bias)}</td>
                          <td className="text-right nums">{r.ourFour !== undefined ? `${r.ourFour}/4` : ""}</td>
                          <td className="text-xs">{ours.map((x) => `${x.runner.signal === "lay" ? "Lay" : "Bet"} ${x.runner.horseName} ${finish(x)}`).join(", ")}</td>
                          <td className="text-right nums">{r.full}/{r.runners.length}</td>
                        </ClickRow>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>
    </Section>
  );
}
