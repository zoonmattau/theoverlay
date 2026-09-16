// Re-rates every race on a date with the model as it is now and rewrites the
// stored card and the model rows on the tips ledger from that, so a fix to
// the ratings reaches the record. Each runner is priced at the last price the
// site saw before its race jumped; where the only price we hold came after
// the jump, the official starting price stands in. Form King is not called:
// the raw form and results come from the fk_cache table.
// npx tsx --conditions=react-server --env-file=.env.local scripts/rerate-ledger.ts [--dry] 2026-09-14 2026-09-15
process.env.OVERLAY_REPLAY = "1";
import type { HorseResult, MeetingSummary, RaceEntry, RaceSummary } from "../src/lib/formking/types";
import { supabaseAdmin } from "../src/lib/billing/access";
import { publishMeeting, selectBestBets } from "../src/lib/model/publish";
import { readStoredCard, writeStoredCard } from "../src/lib/model/store";
import type { PublishedRunner } from "../src/lib/model/types";
import { recordTips } from "../src/lib/tips";

/** Cache rows whose key matches a pattern, keys first so the JSON comes down one row at a time. */
async function cacheRows(pattern: string): Promise<{ key: string; data: unknown }[]> {
  const db = supabaseAdmin();
  const { data: keys, error } = await db.from("fk_cache").select("key").like("key", pattern);
  if (error) throw new Error(error.message);
  const out: { key: string; data: unknown }[] = [];
  for (const { key } of keys ?? []) {
    const { data, error: e } = await db.from("fk_cache").select("key, data").eq("key", key).maybeSingle();
    if (e) throw new Error(e.message);
    if (data) out.push(data as { key: string; data: unknown });
  }
  return out;
}

/** The price a call could have been taken at: what we showed before the jump, else the SP. */
function preJumpOdds(x: PublishedRunner | undefined, jumpTime: string | undefined, e: RaceEntry): RaceEntry["odds"] {
  const jump = jumpTime ? new Date(jumpTime).getTime() : undefined;
  const seenAt = x?.marketAt ? new Date(x.marketAt).getTime() : undefined;
  if (x?.marketPrice && (jump === undefined || seenAt === undefined || seenAt <= jump)) {
    return {
      bestNow: x.marketPrice,
      avgNow: x.marketAvg ?? x.marketPrice,
      avgOpen: x.marketOpen ?? x.marketPrice,
      bestBookies: x.bookies ?? [],
      firmOrDrift: x.marketMove ?? 0,
      timestamp: seenAt ?? 0,
    };
  }
  const sp = e.horseResult?.startingPrice;
  if (!sp) return undefined;
  return { bestNow: sp, avgNow: sp, avgOpen: sp, bestBookies: ["sp"], firmOrDrift: 0, timestamp: jump ?? 0 };
}

async function rerate(date: string) {
  const stored = await readStoredCard(date);
  if (!stored) {
    console.log(date, "no card");
    return;
  }
  const stamp = date.replace(/-/g, "");
  const meetings = (await cacheRows(`meeting:%-${stamp}`)).map((r) => r.data as MeetingSummary);
  // Race keys are "race:<meetingId>/<raceId>".
  const racesByMeeting = new Map<string, RaceSummary[]>();
  for (const r of await cacheRows(`race:%-${stamp}/%`)) {
    const id = r.key.slice("race:".length).split("/")[0];
    racesByMeeting.set(id, [...(racesByMeeting.get(id) ?? []), r.data as RaceSummary]);
  }
  const shown = new Map<string, { runner: PublishedRunner; jumpTime?: string; result?: HorseResult }>();
  for (const m of stored.card.meetings) {
    for (const r of m.races) {
      for (const x of r.runners) {
        // The card may hold a result the cached summary predates.
        const p = r.placings?.find((p) => p.tabNumber === x.tabNumber);
        const result = x.finishPosition !== undefined ? { finishPosition: x.finishPosition, margin: p?.margin ?? 0, startingPrice: p?.sp ?? 0, betfairStartingPrice: p?.bsp ?? 0 } : undefined;
        shown.set(`${r.raceId}:${x.tabNumber}`, { runner: x, jumpTime: r.jumpTime, result });
      }
    }
  }

  const published = [];
  for (const meeting of meetings) {
    const forms = racesByMeeting.get(meeting.id) ?? [];
    if (forms.length === 0) continue;
    const merged: RaceSummary[] = forms.map((form) => {
      const live = meeting.races?.find((r) => r.raceId === form.raceId);
      const fresh = new Map((live?.entries ?? []).map((e) => [e.number, e]));
      return {
        ...form,
        status: live?.status ?? form.status,
        going: live?.going ?? form.going,
        goingNumber: live?.goingNumber ?? form.goingNumber,
        entries: form.entries.map((e) => {
          const l = fresh.get(e.number);
          const seen = shown.get(`${form.raceId}:${e.number}`);
          const base: RaceEntry = l ? { ...e, scratched: l.scratched, barrier: l.barrier ?? e.barrier, jockey: l.jockey ?? e.jockey, weightCarried: l.weightCarried ?? e.weightCarried, horseResult: l.horseResult ?? e.horseResult ?? seen?.result } : { ...e, horseResult: e.horseResult ?? seen?.result };
          return { ...base, odds: preJumpOdds(seen?.runner, seen?.jumpTime, base) };
        }),
      };
    });
    published.push(publishMeeting(meeting, merged));
  }
  // Keep the order the card had.
  const order = new Map(stored.card.meetings.map((m, i) => [m.meetingId, i]));
  published.sort((a, b) => (order.get(a.meetingId) ?? 99) - (order.get(b.meetingId) ?? 99));
  // Missing race form would write an empty card over a real one.
  const storedRaces = stored.card.meetings.reduce((a, m) => a + m.races.length, 0);
  const gotRaces = published.reduce((a, m) => a + m.races.length, 0);
  if (gotRaces < storedRaces * 0.8) {
    console.log(`${date}: only ${gotRaces} of ${storedRaces} races have form in the cache, leaving the card as it is`);
    return;
  }
  const selections = selectBestBets(published);
  const primes = new Set(selections.filter((s) => s.tag === "prime_overlay" || s.tag === "top_overlay").map((s) => `${s.raceId}:${s.tabNumber}`));
  for (const m of published) for (const r of m.races) for (const x of r.runners) if (primes.has(`${r.raceId}:${x.tabNumber}`)) x.prime = true;
  const card = { ...stored.card, meetings: published, selections };

  const before = stored.card.meetings.flatMap((m) => m.races.flatMap((r) => r.runners.filter((x) => x.signal))).length;
  const after = published.flatMap((m) => m.races.flatMap((r) => r.runners.filter((x) => x.signal))).length;
  if (DRY) {
    for (const m of published) for (const r of m.races) for (const x of r.runners) if (x.signal) console.log(`  ${m.track} R${r.raceNumber} ${x.signal} ${x.horseName} $${x.marketPrice} ours $${x.ratedPrice} fin ${x.finishPosition ?? "-"}`);
    console.log(`${date}: dry run, calls ${before} -> ${after}`);
    return;
  }
  const db = supabaseAdmin();
  const { error } = await db.from("tips").delete().eq("date", date).eq("source", "model");
  if (error) throw new Error(error.message);
  await writeStoredCard(date, card, 0);
  await recordTips(date, card);
  const { data: rows } = await db.from("tips").select("side, units").eq("date", date).eq("source", "model");
  const units = (rows ?? []).reduce((a, r) => a + Number(r.units ?? 0), 0);
  console.log(`${date}: ${published.length} meetings re-rated, calls ${before} -> ${after}, ledger ${rows?.length ?? 0} rows, ${units >= 0 ? "+" : ""}${units.toFixed(1)}u settled`);
}

const DRY = process.argv.includes("--dry");

async function main() {
  const dates = process.argv.slice(2).filter((a) => a !== "--dry");
  if (dates.length === 0) throw new Error("Give at least one date.");
  for (const d of dates) await rerate(d);
}
main();
