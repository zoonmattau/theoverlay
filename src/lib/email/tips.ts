import "server-only";

import { logEvent } from "@/lib/admin";
import { isAdminEmail } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { planCovers } from "@/lib/billing/plans";
import { longDate, price, priceWithChance } from "@/lib/format";
import type { StoredCard } from "@/lib/model/store";
import { sendEmail } from "./send";
import type { EmailSpec } from "./template";
import { unsubscribeUrl } from "./unsubscribe";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

interface Row {
  id: string;
  email: string | null;
  plan: string | null;
  access_until: string | null;
  bonus_until: string | null;
  paused_at: string | null;
  marketing_opt_in: boolean;
  is_admin: boolean;
}

/** Members whose access covers the date and who ticked tips emails. */
async function recipients(date: string): Promise<Row[]> {
  const { data } = await supabaseAdmin()
    .from("profiles")
    .select("id, email, plan, access_until, bonus_until, paused_at, marketing_opt_in, is_admin")
    .eq("marketing_opt_in", true)
    .not("email", "is", null);
  const now = Date.now();
  return ((data ?? []) as Row[]).filter((r) => {
    if (r.paused_at) return false;
    if (r.is_admin || isAdminEmail(r.email)) return true;
    const pro = r.access_until && new Date(r.access_until).getTime() > now;
    if (pro && planCovers(r.plan ?? undefined, date)) return true;
    return Boolean(r.bonus_until && new Date(r.bonus_until).getTime() > now);
  });
}

interface Call {
  track: string;
  raceNumber: number;
  url: string;
  runner: string;
  rated: string;
  live: string;
  side: "bet" | "lay";
  prime: boolean;
}

function calls(date: string, card: StoredCard): Call[] {
  const prime = new Set(card.selections.filter((s) => s.tag === "prime_overlay").map((s) => `${s.raceId}:${s.tabNumber}`));
  return card.meetings
    .flatMap((m) =>
      m.races.flatMap((r) =>
        r.runners
          .filter((x) => x.signal && !x.scratched)
          .map((x) => ({
            track: m.track,
            raceNumber: r.raceNumber,
            jump: r.jumpTime ?? "",
            url: `${SITE}/racing/${date}/${encodeURIComponent(m.meetingId)}/${encodeURIComponent(r.raceId)}`,
            runner: `${x.tabNumber}. ${x.horseName}`,
            rated: priceWithChance(x.ratedPrice, x.ratedProbability),
            live: price(x.marketPrice),
            side: (x.signal === "back" ? "bet" : "lay") as "bet" | "lay",
            prime: prime.has(`${r.raceId}:${x.tabNumber}`),
          })),
      ),
    )
    .sort((a, b) => (a.side === b.side ? a.jump.localeCompare(b.jump) : a.side === "bet" ? -1 : 1));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function table(rows: Call[]): string {
  if (rows.length === 0) return `<p style="margin:0;font:400 14px ${FONT};color:#8b918a">None today.</p>`;
  const cell = (s: string, extra = "") => `<td style="padding:8px 6px;border-top:1px solid #eef0ea;font:400 14px ${FONT};color:#14161a;${extra}">${s}</td>`;
  const body = rows
    .map((c) => {
      const colour = c.side === "bet" ? "#1f6fd6" : "#d93636";
      const badge = `<span style="display:inline-block;padding:2px 7px;border-radius:4px;background:${colour};color:#fff;font:700 11px ${FONT};text-transform:uppercase">${c.side}</span>`;
      const primeTag = c.prime ? ` <span style="display:inline-block;padding:2px 7px;border-radius:4px;background:#c6f24e;color:#14161a;font:700 11px ${FONT}">Prime</span>` : "";
      return `<tr>${cell(`<a href="${c.url}" style="color:#14161a;font-weight:700;text-decoration:none">${esc(c.track)} R${c.raceNumber}</a>`)}${cell(esc(c.runner) + primeTag)}${cell(`<strong style="color:${colour}">${c.live}</strong>`, "text-align:right")}${cell(c.rated, "text-align:right;white-space:nowrap")}${cell(badge, "text-align:right")}</tr>`;
    })
    .join("");
  const head = (s: string, extra = "") => `<th style="padding:0 6px 6px;text-align:left;font:700 11px ${FONT};color:#8b918a;text-transform:uppercase;letter-spacing:.06em;${extra}">${s}</th>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 16px;border-collapse:collapse"><tr>${head("Race")}${head("Runner")}${head("Live", "text-align:right")}${head("Rated", "text-align:right")}${head("")}</tr>${body}</table>`;
}

export function morningTipsEmail(date: string, card: StoredCard, userId: string): EmailSpec {
  const all = calls(date, card);
  const bets = all.filter((c) => c.side === "bet");
  const lays = all.filter((c) => c.side === "lay");
  const primes = bets.filter((c) => c.prime).length;
  const races = card.meetings.reduce((a, m) => a + m.races.length, 0);
  const day = longDate(date);
  return {
    subject: `${day}: ${bets.length} ${bets.length === 1 ? "bet" : "bets"}, ${lays.length} ${lays.length === 1 ? "lay" : "lays"}`,
    preheader: primes ? `${primes} Prime ${primes === 1 ? "Overlay" : "Overlays"} on the card.` : `${races} races rated, prices refresh through the day.`,
    heading: `Today's calls, ${day}.`,
    paragraphs: [
      `${races} races rated across ${card.meetings.length} meetings, with <strong>${bets.length} ${bets.length === 1 ? "bet" : "bets"}</strong> and <strong>${lays.length} ${lays.length === 1 ? "lay" : "lays"}</strong> called at 8am prices.`,
      `<strong style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#1f6fd6">Bets</strong>${table(bets)}`,
      `<strong style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#d93636">Lays</strong>${table(lays)}`,
      "Prices move, so check the live price on the race page before you bet.",
    ],
    cta: { label: "Open today's tips", url: `${SITE}/tips` },
    note: `You get this because you ticked tips emails. <a href="${unsubscribeUrl(userId)}" style="color:#8b918a">Unsubscribe</a> with one click.`,
  };
}

/**
 * The morning send, once per date. Returns how many went out; a second call
 * on the same date sends nothing unless forced.
 */
export async function sendMorningTips(date: string, card: StoredCard, force = false): Promise<{ sent: number; skipped: string }> {
  const db = supabaseAdmin();
  if (!force) {
    const { data } = await db.from("events").select("id").eq("kind", "tips_email").contains("meta", { date }).limit(1);
    if (data && data.length > 0) return { sent: 0, skipped: "already sent" };
  }
  const to = await recipients(date);
  let sent = 0;
  for (const r of to) {
    const ok = await sendEmail(r.email!, morningTipsEmail(date, card, r.id), {
      "List-Unsubscribe": `<${unsubscribeUrl(r.id)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    if (ok) sent++;
    // Resend allows a couple of sends a second.
    await new Promise((res) => setTimeout(res, 600));
  }
  await logEvent({ user_id: null, kind: "tips_email", plan: null, amount_cents: null, meta: { date, sent, recipients: to.length } });
  return { sent, skipped: "" };
}
