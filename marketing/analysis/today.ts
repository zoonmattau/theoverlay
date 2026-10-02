// Today's calls, the free race and the meetings, for planning a reel.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/analysis/today.ts [date]
import { supabaseAdmin } from "../../src/lib/billing/access";
(async () => {
  const date = process.argv[2] ?? new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const { data } = await supabaseAdmin().from("cards").select("card, free_race_id").eq("date", date).maybeSingle();
  if (!data) return console.log("no card", date);
  const card = data.card as any;
  const t = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "");
  console.log(date, "free race", data.free_race_id);
  for (const m of card.meetings) {
    const calls = m.races.flatMap((r: any) => r.runners.filter((x: any) => x.signal && !x.scratched).map((x: any) => `R${r.raceNumber} ${t(r.jumpTime)} ${x.signal === "lay" ? "LAY" : x.prime ? "PRIME" : "BET"} ${x.tabNumber}. ${x.horseName} $${x.marketPrice} rated $${x.ratedPrice}${r.abandoned ? " (abandoned)" : ""}`));
    console.log(`\n${m.track} (${m.state}) ${m.trackCondition ?? ""}, ${m.races.length} races${m.races.every((r: any) => r.abandoned) ? ", abandoned" : ""}`);
    for (const c of calls) console.log("  " + c);
  }
})();
