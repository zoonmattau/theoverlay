import "server-only";

import { logEvent } from "@/lib/admin";
import { isAdminEmail } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { bestBookie, type Bookie } from "@/lib/bookies";
import { longDate, price, priceWithChance } from "@/lib/format";
import { creatorTips, tipsterById, type CreatorTip, type Tipster } from "@/lib/creators";
import { readStoredCard, type StoredCard } from "@/lib/model/store";
import { callPrice } from "@/lib/model/types";
import { racingToday, released } from "@/lib/model/source";
import { sendEmail } from "./send";
import type { EmailSpec } from "./template";
import { tipsterTable } from "./tipster";
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
/**
 * Everyone with an email who has not unsubscribed or paused, confirmed or
 * not, paying or not: the morning email is how the day's calls reach the
 * whole list. Admins always; tipster accounts never, their calls are their
 * own.
 */
async function recipients(): Promise<Row[]> {
  const db = supabaseAdmin();
  const [{ data }, { data: tipsters }] = await Promise.all([
    db.from("profiles").select("id, email, plan, access_until, bonus_until, paused_at, marketing_opt_in, is_admin").eq("marketing_opt_in", true).not("email", "is", null),
    db.from("affiliates").select("user_id").not("user_id", "is", null),
  ]);
  const tipster = new Set(((tipsters ?? []) as { user_id: string }[]).map((t) => t.user_id));
  return ((data ?? []) as Row[]).filter((r) => {
    if (r.paused_at) return false;
    if (r.is_admin || isAdminEmail(r.email)) return true;
    return !tipster.has(r.id);
  });
}

interface Call {
  track: string;
  raceNumber: number;
  url: string;
  runner: string;
  rated: string;
  live: string;
  bookie?: Bookie;
  side: "bet" | "lay";
  prime: boolean;
}

function calls(date: string, card: StoredCard): Call[] {
  const prime = new Set(card.selections.filter((s) => s.tag === "prime_overlay" || s.tag === "top_overlay").map((s) => `${s.raceId}:${s.tabNumber}`));
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
            live: price(callPrice(x) ?? x.marketPrice),
            bookie: bestBookie(x.bookies),
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
      return `<tr>${cell(`<a href="${c.url}" style="color:#14161a;font-weight:700;text-decoration:none">${esc(c.track)} R${c.raceNumber}</a>`)}${cell(esc(c.runner) + primeTag)}${cell(`<strong style="color:${colour}">${c.live}</strong>${c.bookie ? `<br><a href="${c.bookie.url}" style="font:600 11px ${FONT};color:#6b716a;text-decoration:none">at ${esc(c.bookie.name)}</a>` : ""}`, "text-align:right;white-space:nowrap")}${cell(c.rated, "text-align:right;white-space:nowrap")}${cell(badge, "text-align:right")}</tr>`;
    })
    .join("");
  const head = (s: string, extra = "") => `<th style="padding:0 6px 6px;text-align:left;font:700 11px ${FONT};color:#8b918a;text-transform:uppercase;letter-spacing:.06em;${extra}">${s}</th>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 16px;border-collapse:collapse"><tr>${head("Race")}${head("Runner")}${head("Live", "text-align:right")}${head("Rated", "text-align:right")}${head("")}</tr>${body}</table>`;
}

/** The tipster a member follows and what they have posted for the day so far. */
export interface Followed {
  tipster: Tipster;
  tips: CreatorTip[];
}

export function morningTipsEmail(date: string, card: StoredCard, userId: string, followed: Followed[] = []): EmailSpec {
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
      `${races} races rated across ${card.meetings.length} meetings, with <strong>${bets.length} ${bets.length === 1 ? "bet" : "bets"}</strong> and <strong>${lays.length} ${lays.length === 1 ? "lay" : "lays"}</strong> called at 11am prices.`,
      `<strong style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#1f6fd6">Bets</strong>${table(bets)}`,
      `<strong style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#d93636">Lays</strong>${table(lays)}`,
      ...(followed.filter((f) => f.tips.length > 0).length > 0
        ? followed.filter((f) => f.tips.length > 0).map((f) => `<strong style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#6f9a12">${esc(f.tipster.name)}'s tips</strong>${tipsterTable(f.tips)}`)
        : []),
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
  const to = await recipients();
  // Who follows whom, and each tipster's calls for the day, fetched once.
  const { data: followRows } = await db.from("follows").select("user_id, tipster_id").in("user_id", to.map((r) => r.id));
  const followsOf = new Map<string, string[]>();
  for (const f of (followRows ?? []) as { user_id: string; tipster_id: string }[]) followsOf.set(f.user_id, [...(followsOf.get(f.user_id) ?? []), f.tipster_id]);
  const followed = new Map<string, Followed>();
  for (const id of new Set([...followsOf.values()].flat())) {
    const tipster = await tipsterById(id);
    if (tipster?.user_id) followed.set(id, { tipster, tips: await creatorTips(id, date) });
  }
  let sent = 0;
  for (const r of to) {
    const theirs = (followsOf.get(r.id) ?? []).map((id) => followed.get(id)).filter((f): f is Followed => Boolean(f));
    const ok = await sendEmail(r.email!, morningTipsEmail(date, card, r.id, theirs), {
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

/**
 * Today's email for someone who signed up after it went out, so a Saturday
 * sign-up at 11:05 is not waiting until Sunday. Sends only when the morning
 * send has already gone (else the cron will include them), the card is
 * released, a race is still to run, and they ticked tips emails. Never
 * throws: a missed email must not break a sign-up.
 */
export async function sendTodaysTipsTo(userId: string, email: string, optedIn: boolean): Promise<boolean> {
  try {
    if (!optedIn) return false;
    const date = racingToday();
    if (!released(date)) return false;
    const db = supabaseAdmin();
    const { data: sent } = await db.from("events").select("id").eq("kind", "tips_email").contains("meta", { date }).gt("meta->>sent", "0").limit(1);
    if (!sent || sent.length === 0) return false;
    const stored = await readStoredCard(date);
    if (!stored) return false;
    const toRun = stored.card.meetings.some((m) => m.races.some((r) => !r.result && r.jumpTime && new Date(r.jumpTime).getTime() > Date.now()));
    if (!toRun) return false;
    return await sendEmail(email, morningTipsEmail(date, stored.card, userId), {
      "List-Unsubscribe": `<${unsubscribeUrl(userId)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  } catch (err) {
    console.error("[tips] sign-up send", err);
    return false;
  }
}
