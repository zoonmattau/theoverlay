import Link from "next/link";

import { personKey } from "@/lib/data/people";
import { HubFilters } from "./HubFilters";
import { HubLocked, hubViewer } from "./shared";
import { PeopleTable, PersonRunsTable, BreakdownTable, UpcomingTable, type LinkedBreakdown } from "@/components/HubTables";
import { DISTANCE_BANDS, GOINGS, filterActive, filterFrom, filterQuery, filterWords } from "@/lib/data/filters";
import { hubPeople, hubPerson, hubTracksList } from "@/lib/data/hub";
import { upcomingFor } from "@/lib/data/upcoming";

/** Each row with its link, made here: a function cannot be handed to the client table. */
const linked = (rows: LinkedBreakdown[], link: (label: string) => string): LinkedBreakdown[] => rows.map((r) => ({ ...r, href: link(r.label) }));

type Kind = "jockey" | "trainer";
const noun = (k: Kind) => (k === "jockey" ? "jockeys" : "trainers");
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** The ranking for jockeys or trainers, cut by the filters in the query. */
export async function PeopleList({ kind, searchParams }: { kind: Kind; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ open }, sp] = await Promise.all([hubViewer(), searchParams]);
  if (!open) return <HubLocked what={`The ${kind} rankings`} />;
  const filter = filterFrom(sp);
  const [rows, tracks] = await Promise.all([hubPeople(kind, filter), hubTracksList()]);
  return (
    <section className="py-6">
      <p className="mb-3 text-sm text-ink-secondary">
        {kind === "jockey" ? "Every rider, ranked on how their mounts go against the market." : "Every stable, ranked on how its runners go against the market."} Power is winners over what the market expected, per hundred {kind === "jockey" ? "rides" : "runners"}. Click a name for the profile.
      </p>
      <HubFilters base={`/data/${noun(kind)}`} filter={filter} tracks={tracks} find={str(sp.find) || undefined} />
      {filterActive(filter) && <p className="mb-2 text-sm font-semibold">{filterWords(filter)}</p>}
      <PeopleTable rows={rows} find={str(sp.find) || undefined} what={kind === "jockey" ? "rider" : "stable"} filtered={filterActive(filter)} />
    </section>
  );
}

/** One person: record, where and with whom, what is coming up, the last runs. */
export async function PersonPage({ kind, params }: { kind: Kind; params: Promise<{ key: string }> }) {
  const [{ open }, p] = await Promise.all([hubViewer(), params]);
  const key = decodeURIComponent(p.key).toLowerCase();
  if (!open) return <HubLocked what={`${kind === "jockey" ? "Jockey" : "Trainer"} profiles`} />;
  const [profile, upcoming] = await Promise.all([hubPerson(kind, key), upcomingFor(kind, key)]);
  if (!profile) {
    return (
      <section className="py-6">
        <p className="text-sm text-ink-soft">No runs on the form we hold for that {kind}. <Link href={`/data/${noun(kind)}`} className="text-blue">Back to the rankings</Link>.</p>
      </section>
    );
  }
  const s = profile.summary;
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
  const day = (iso: string) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  const other = kind === "jockey" ? "trainer" : "jockey";
  return (
    <section className="py-6 space-y-6">
      <div>
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">{profile.name}</h2>
          <Link href={`/data/${noun(kind)}?find=${encodeURIComponent(profile.name)}`} className="badge badge-prime">{profile.rank > 0 ? `${ordinal(profile.rank)} of ${profile.of}` : "unranked"} on Power</Link>
        </div>
        <p className="mt-1 text-sm text-ink-secondary">
          {s.rides.toLocaleString("en-AU")} {kind === "jockey" ? "rides" : "runners"} on the form we hold, {day(s.firstRide)} to {day(s.lastRide)}.
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <Stat n={signed(s.power)} label="Power" tone={s.power > 0 ? "prime" : s.power < 0 ? "lay" : undefined} />
          <Stat n={`${s.wins} / ${s.rides}`} label="wins" />
          <Stat n={`${s.winPct.toFixed(1)}%`} label="win rate" />
          <Stat n={`${s.placePct.toFixed(1)}%`} label="place rate" />
          <Stat n={signed(Math.round((s.winsPriced - s.expected) * 10) / 10)} label="v market" sub={`market said ${s.expected.toFixed(1)} of ${s.priced}`} tone={s.winsPriced - s.expected > 0 ? "prime" : s.winsPriced - s.expected < 0 ? "lay" : undefined} />
          <Stat n={`${s.wins30} / ${s.rides30}`} label="last 30 days" />
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Coming up</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing on today&apos;s or tomorrow&apos;s card.</p>
        ) : (
          <UpcomingTable rows={upcoming} other={other} atTrack={profile.byTrack} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">By track</h3>
          <BreakdownTable rows={linked(profile.byTrack, (l) => `/data/${noun(kind)}${filterQuery({ tracks: [l] }, { find: profile.name })}`)} label="Track" noun="tracks" hint="Click a track for the ranking there, with this one found." />
        </div>
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">With</h3>
          <BreakdownTable rows={linked(profile.with, (l) => `/data/${other}s/${encodeURIComponent(keyOf(l))}`)} label={other === "jockey" ? "Jockey" : "Trainer"} noun={`${other}s`} hint="Click a name for their profile." />
          <p className="mt-1 text-xs text-ink-soft"><Link href={`/data/combos?find=${encodeURIComponent(kind === "jockey" ? `${profile.name} / ` : ` / ${profile.name}`)}`} className="underline">Every pairing in Combos</Link>.</p>
        </div>
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">By distance</h3>
          <BreakdownTable rows={linked(profile.byDistance, (l) => `/data/${noun(kind)}${filterQuery({ band: bandKey(l) }, { find: profile.name })}`)} label="Trip" noun="bands" hint="Click a trip for the ranking over it." />
        </div>
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">By going</h3>
          <BreakdownTable rows={linked(profile.byGoing, (l) => `/data/${noun(kind)}${filterQuery({ goings: goingNums(l) }, { find: profile.name })}`)} label="Going" noun="goings" hint="Click a going for the ranking on it." />
        </div>
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">By price</h3>
          <BreakdownTable rows={profile.byPrice} label="Started at" noun="bands" keepOrder />
        </div>
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">By year</h3>
          <BreakdownTable rows={profile.byYear} label="Year" noun="years" />
        </div>
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Horses</h3>
          <BreakdownTable rows={linked(profile.horses, (l) => `/data/horses?q=${encodeURIComponent(l)}`)} label="Horse" noun="horses" hint="Click a horse to look it up." />
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Last runs</h3>
        <PersonRunsTable rows={profile.recent} other={other} />
      </div>
    </section>
  );
}

function Stat({ n, label, sub, tone }: { n: string; label: string; sub?: string; tone?: "prime" | "lay" }) {
  return (
    <div className="card py-3 text-center">
      <div className={`font-display font-extrabold text-xl nums ${tone === "prime" ? "text-accent" : tone === "lay" ? "text-red" : ""}`}>{n}</div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">{label}</div>
      {sub && <div className="text-xs text-ink-soft nums">{sub}</div>}
    </div>
  );
}

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const keyOf = (name: string) => personKey(name) ?? name;
const bandKey = (label: string) => DISTANCE_BANDS.find((b) => b.label === label)?.key ?? "";
const goingNums = (label: string) => { const g = label.toLowerCase(); const band = g.startsWith("heavy") ? "heavy" : /^(soft|slow|dead)/.test(g) ? "soft" : /^(good|firm|fast)/.test(g) ? "good" : ""; return GOINGS.filter((x) => x.band === band).map((x) => x.n); };
