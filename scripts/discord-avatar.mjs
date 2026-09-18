// Gives the bot the brand avatar (the lime mark) as its profile picture.
// node --env-file=.env.local scripts/discord-avatar.mjs [path/to/image.png]
import { readFile } from "node:fs/promises";

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error("DISCORD_BOT_TOKEN needed");
const file = process.argv[2] ?? "public/brand/avatar-1080.png";
const bytes = await readFile(file);
const res = await fetch("https://discord.com/api/v10/users/@me", {
  method: "PATCH",
  headers: { authorization: `Bot ${token}`, "content-type": "application/json", "user-agent": "TheOverlay/1.0" },
  body: JSON.stringify({ avatar: `data:image/png;base64,${bytes.toString("base64")}` }),
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const me = await res.json();
console.log(`avatar set on ${me.username}: https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`);
