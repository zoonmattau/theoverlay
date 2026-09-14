// Looks at what Form King serves for a past date: feature races, and whether a
// resulted race still carries pre-race form and prices.
// npx tsx --conditions=react-server --env-file=.env.local scripts/probe-past.ts 2026-09-05 [meetingId/raceId]
import { getMeetingsByDate, getRace } from "../src/lib/formking/client";

async function main() {
  const date = process.argv[2];
  const index = await getMeetingsByDate(date, ["NSW", "VIC", "QLD"]);
  for (const m of index) {
    const feats = (m.races ?? []).filter((r) => /group|listed|\bG[123]\b|\bLR\b/i.test(`${r.name} ${(r as { restrictions?: string }).restrictions ?? ""}`));
    console.log(m.id, m.trackName, m.state, m.status, m.tabMeeting, "races", m.races?.length, "keys", Object.keys(m.races?.[0] ?? {}).join(","));
    for (const r of feats) console.log("   ", r.number, r.raceId, r.name, (r as { restrictions?: string }).restrictions, r.status);
  }
  const target = process.argv[3];
  if (target) {
    const [mid, rid] = target.split("/");
    const race = await getRace(mid, rid);
    console.log(race.name, race.status, race.going, "entries", race.entries.length);
    for (const e of race.entries.slice(0, 4)) {
      console.log(e.number, e.horse.name, "odds", JSON.stringify(e.odds), "result", JSON.stringify(e.horseResult));
      console.log("   pastEvents", (e.pastEvents ?? []).filter((p) => p.race).slice(0, 3).map((p) => `${new Date(p.date).toISOString().slice(0, 10)} ${p.track} fin ${p.finishPosition}`).join(" | "));
    }
  }
}
main();
