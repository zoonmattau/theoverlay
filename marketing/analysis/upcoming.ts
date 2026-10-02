// Prints the charges Stripe will try in the next fortnight, as the Money tab shows them.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/analysis/upcoming.ts
import { upcomingCharges } from "../../src/lib/money";
(async () => {
  const { charges, error } = await upcomingCharges(14);
  if (error) console.log("error:", error);
  for (const c of charges) console.log(new Date(c.at * 1000).toLocaleString("en-AU", { timeZone: "Australia/Sydney" }), c.kind.padEnd(10), c.plan.padEnd(12), `$${(c.amount_cents / 100).toFixed(2)}`, c.who.replace(/(.{3}).*(@.*)/, "$1…$2"));
})();
