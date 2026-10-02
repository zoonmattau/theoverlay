// Who the trial-to-monthly email would go to on a given day. Sends nothing.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/analysis/nudge-dry.ts [yyyy-mm-ddThh:mm+10:00]
import { nudgeLongTermTrials } from "../../src/lib/email/term-nudge";
(async () => {
  const at = process.argv[2] ? new Date(process.argv[2]).getTime() : Date.now();
  console.log("would send", await nudgeLongTermTrials({ dry: true, now: at }), "at", new Date(at).toISOString());
})();
