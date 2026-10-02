// Re-syncs one member's Discord role with the current rules.
//   OVERLAY_DISCORD_LOCAL=1 npx tsx --conditions=react-server --env-file=.env.local marketing/analysis/sync-role.ts <userId>
import { syncDiscordMember } from "../../src/lib/discord";
(async () => {
  await syncDiscordMember(process.argv[2]);
  console.log("synced", process.argv[2]);
})();
