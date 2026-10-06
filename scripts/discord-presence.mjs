// Keeps The Overlay's Discord app showing online, "Watching theoverlay.com.au", for the free promo in the member list.
// The site only talks to Discord over REST, which never shows a bot as online; this holds a gateway connection open.
// Needs DISCORD_BOT_TOKEN (from .env.local). No packages: Node's own WebSocket.
// node scripts/discord-presence.mjs        (runs until stopped; reconnects on its own)
import { readFileSync } from "node:fs";

for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) throw new Error("DISCORD_BOT_TOKEN is not set");
const STATUS = process.env.DISCORD_STATUS ?? "theoverlay.com.au";
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

let seq = null, session = null, resumeUrl = null, beat = null, acked = true;

function connect(resume) {
  const ws = new WebSocket(`${resume && resumeUrl ? resumeUrl : "wss://gateway.discord.gg"}/?v=10&encoding=json`);
  const send = (op, d) => ws.send(JSON.stringify({ op, d }));
  ws.onmessage = (ev) => {
    const { op, d, s, t } = JSON.parse(ev.data);
    if (s != null) seq = s;
    if (op === 10) {
      // Hello: heartbeat on Discord's interval, then identify (or resume a dropped session).
      clearInterval(beat);
      acked = true;
      beat = setInterval(() => {
        if (!acked) { log("no heartbeat ack, reconnecting"); ws.close(4000); return; }
        acked = false;
        send(1, seq);
      }, d.heartbeat_interval);
      if (resume && session) send(6, { token: TOKEN, session_id: session, seq });
      else send(2, {
        token: TOKEN, intents: 0,
        properties: { os: "windows", browser: "the-overlay", device: "the-overlay" },
        presence: { status: "online", afk: false, since: null, activities: [{ name: STATUS, type: 3 }] },
      });
    } else if (op === 11) acked = true;
    else if (op === 1) send(1, seq);
    else if (op === 7) ws.close(4000); // Discord asks for a reconnect
    else if (op === 9) { session = null; setTimeout(() => ws.close(4000), 2000); } // session gone: identify afresh
    else if (op === 0 && t === "READY") { session = d.session_id; resumeUrl = d.resume_gateway_url; log(`online as ${d.user.username}, watching ${STATUS}`); }
    else if (op === 0 && t === "RESUMED") log("resumed");
  };
  ws.onclose = (ev) => {
    clearInterval(beat);
    // 4004 bad token, 4013/4014 bad intents: no point retrying.
    if ([4004, 4010, 4011, 4012, 4013, 4014].includes(ev.code)) { log("closed for good:", ev.code, ev.reason); process.exit(1); }
    log("closed", ev.code, "reconnecting in 5s");
    setTimeout(() => connect(Boolean(session)), 5000);
  };
  ws.onerror = () => {};
}
connect(false);
