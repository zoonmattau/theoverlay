// Bad clocks out of the standard times. Three rules, each printed as it fires:
//   A. HorseEdge's South Australian times run 10-20% slow against the feed's for the same track and distance (a different scrape): dropped.
//   B. A distance at a track whose pace against the typical time over that distance is 5% or more out of line with the track's
//      own other distances is a mislabelled distance (Belmont Park "1100m" at 59.8s): dropped.
//   C. Times outside 0.053 to 0.073 seconds a metre cannot be right for the distance: dropped (also applied on import).
//   D. Where the feed and HorseEdge both time a track and distance (ten runs each) and HorseEdge's median is 3% or more
//      away from the feed's, HorseEdge's clock is wrong there (Moe 1000m: feed 61.96, HorseEdge 67.34): dropped.
// A dropped time is set null; the run stays for everything else.
// npx tsx --conditions=react-server --env-file=.env.local scripts/clean-standards.ts
import { supabaseAdmin } from "../src/lib/billing/access";
const db = supabaseAdmin();
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
async function distances() {
  const all: Record<string, unknown>[] = [];
  for (let f = 0; ; f += 1000) { const { data } = await db.rpc("hub_track_distances").range(f, f + 999); if (!data?.length) break; all.push(...(data as Record<string, unknown>[])); if (data.length < 1000) break; }
  return all.map((r) => ({ track: String(r.track), distance: Number(r.distance), runs: Number(r.runs), median: Number(r.median_ms) / 1000 }));
}
(async () => {
  // A. HorseEdge SA.
  const { count: sa } = await db.from("runs").select("race_id", { count: "exact", head: true }).eq("source", "horseedge").eq("state", "SA").not("time_ms", "is", null);
  if (sa) { await db.from("runs").update({ time_ms: null }).eq("source", "horseedge").eq("state", "SA").not("time_ms", "is", null); console.log(`A. ${sa} HorseEdge South Australian times dropped: 10-20% slow against the feed's, a different scrape.`); }
  // B. Mislabelled distances, by pace against the track's own.
  const rows = (await distances()).filter((r) => r.runs >= 20);
  const byD = new Map<number, number[]>(); for (const r of rows) byD.set(r.distance, [...(byD.get(r.distance) ?? []), r.median]);
  const ratio = new Map<string, number>();
  for (const r of rows) { const others = (byD.get(r.distance) ?? []).filter((m) => m !== r.median); if (others.length >= 3) ratio.set(`${r.track}:${r.distance}`, r.median / med(others)); }
  let dropped = 0;
  for (const r of rows) {
    const mine = ratio.get(`${r.track}:${r.distance}`); if (mine === undefined) continue;
    const own = rows.filter((x) => x.track === r.track && x.distance !== r.distance).map((x) => ratio.get(`${x.track}:${x.distance}`)).filter((v): v is number => v !== undefined);
    if (own.length < 2) continue;
    const off = mine / med(own) - 1;
    if (Math.abs(off) < 0.05) continue;
    const { count } = await db.from("runs").select("race_id", { count: "exact", head: true }).eq("track", r.track).eq("distance", r.distance).not("time_ms", "is", null);
    await db.from("runs").update({ time_ms: null }).eq("track", r.track).eq("distance", r.distance).not("time_ms", "is", null);
    dropped += count ?? 0;
    console.log(`B. ${r.track} ${r.distance}m: ${count} times dropped, ${off > 0 ? "slower" : "quicker"} by ${(Math.abs(off) * 100).toFixed(1)}% than the track's own pace over its other distances, a mislabelled distance.`);
  }
  console.log(`B. ${dropped} times dropped as mislabelled distances.`);
  // C. Impossible for the distance.
  let impossible = 0;
  for (const d of [...new Set((await distances()).map((r) => r.distance))]) {
    const lo = Math.round(d * 0.053 * 1000), hi = Math.round(d * 0.073 * 1000);
    for (const [op, v] of [["lt", lo], ["gt", hi]] as const) {
      const { count } = await db.from("runs").select("race_id", { count: "exact", head: true }).eq("distance", d)[op]("time_ms", v);
      if (!count) continue;
      await db.from("runs").update({ time_ms: null }).eq("distance", d)[op]("time_ms", v);
      impossible += count;
    }
  }
  console.log(`C. ${impossible} times dropped as impossible for their distance.`);
  // D. HorseEdge against the feed, track by track and distance by distance.
  let disagreed = 0;
  for (const r of await distances()) {
    if (r.runs < 20) continue;
    const times = async (source: string) => ((await db.from("runs").select("time_ms").eq("track", r.track).eq("distance", r.distance).eq("source", source).not("time_ms", "is", null).limit(3000)).data ?? []).map((x) => Number(x.time_ms) / 1000);
    const [feed, he] = await Promise.all([times("feed"), times("horseedge")]);
    if (feed.length < 10 || he.length < 10) continue;
    const off = med(he) / med(feed) - 1;
    if (Math.abs(off) < 0.03) continue;
    await db.from("runs").update({ time_ms: null }).eq("track", r.track).eq("distance", r.distance).eq("source", "horseedge").not("time_ms", "is", null);
    disagreed += he.length;
    console.log(`D. ${r.track} ${r.distance}m: ${he.length} HorseEdge times dropped, ${(Math.abs(off) * 100).toFixed(1)}% ${off > 0 ? "slower" : "quicker"} than the feed's ${feed.length} runs there.`);
  }
  console.log(`D. ${disagreed} HorseEdge times dropped where the feed disagreed.`);
})();
