// Trials that have ended, and how many went on to a paid invoice: the rate the Money tab's expected figure uses.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/analysis/conversion.ts
import { trialConversion } from "../../src/lib/money";
(async () => console.log(await trialConversion()))();
