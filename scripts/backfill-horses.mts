// Fills the horse store from every Form King race we already hold: the
// local cache first (Saturdays back to August), then the fk_cache table.
// npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/backfill-horses.mts
import { readdirSync, readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const { rememberHorses } = await import("../src/lib/model/horses");
type Race = { raceId: string; meetingId?: string; trackName?: string; state?: string; date?: number; entries: unknown[] };

const races: Race[] = readdirSync(".formking-cache")
  .filter((f) => f.startsWith("race-"))
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as Race);

const env = process.env as Record<string, string>;
const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fk_cache?select=data&kind=eq.race`, { headers: h });
const remote = (await res.json()) as { data: Race }[] | { message: string };
if (Array.isArray(remote)) for (const r of remote) races.push(r.data);
else console.log("fk_cache:", remote.message);

// Oldest first, so the newest sighting is what ends up stored.
races.sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
console.log(`${races.length} races to fold in`);
let n = 0;
for (const r of races) {
  const meeting = { id: r.meetingId ?? "", trackName: r.trackName, state: r.state, date: r.date, status: "", tabMeeting: true, updated: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await rememberHorses(meeting as any, [r as any]);
  if (++n % 100 === 0) console.log(`  ${n}`);
}
const { count } = await (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/horses?select=id`, { headers: { ...h, prefer: "count=exact", range: "0-0" } })).headers.get("content-range")!.split("/").reduce((a, v, i) => (i === 1 ? { count: Number(v) } : a), { count: 0 });
console.log(`done: ${count} horses in the store`);
