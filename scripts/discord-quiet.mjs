// Turns off Discord's own system messages in the server: the "X just joined"
// welcomes, the boost notices, the setup tips and the sticker replies on joins.
// node --env-file=.env.local scripts/discord-quiet.mjs
const token = process.env.DISCORD_BOT_TOKEN;
const guild = process.env.DISCORD_GUILD_ID;
if (!token || !guild) throw new Error("DISCORD_BOT_TOKEN and DISCORD_GUILD_ID needed");
const headers = { authorization: `Bot ${token}`, "content-type": "application/json", "user-agent": "TheOverlay/1.0" };
const before = await (await fetch(`https://discord.com/api/v10/guilds/${guild}`, { headers })).json();
console.log("system channel flags before:", before.system_channel_flags);
// 1 join notifications, 2 boost notices, 4 setup tips, 8 join sticker replies, 16 role subscription notices, 32 their replies.
const res = await fetch(`https://discord.com/api/v10/guilds/${guild}`, { method: "PATCH", headers: { ...headers, "x-audit-log-reason": "Quiet system messages" }, body: JSON.stringify({ system_channel_flags: 1 | 2 | 4 | 8 | 16 | 32 }) });
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const after = await res.json();
console.log("system channel flags after:", after.system_channel_flags);
