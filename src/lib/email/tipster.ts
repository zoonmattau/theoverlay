import "server-only";

import { logEvent } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
import { followerIds, priceFlagged, stakeLabel, struckAt, tipsterById, type CreatorTip, type Tipster } from "@/lib/creators";
import { longDate, price } from "@/lib/format";
import { sendEmail } from "./send";
import type { EmailSpec } from "./template";
import { unsubscribeUrl } from "./unsubscribe";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A tipster's calls as an email table: race, runner, the price and where, the why. */
export function tipsterTable(tips: CreatorTip[]): string {
  if (tips.length === 0) return `<p style="margin:0;font:400 14px ${FONT};color:#8b918a">None yet.</p>`;
  const cell = (s: string, extra = "") => `<td style="padding:8px 6px;border-top:1px solid #eef0ea;font:400 14px ${FONT};color:#14161a;vertical-align:top;${extra}">${s}</td>`;
  const body = tips
    .map((t) => {
      const colour = t.side === "back" ? "#1f6fd6" : "#d93636";
      const badge = `<span style="display:inline-block;padding:2px 7px;border-radius:4px;background:${colour};color:#fff;font:700 11px ${FONT};text-transform:uppercase">${t.side === "back" ? "bet" : "lay"}${stakeLabel(t) ? ` ${stakeLabel(t)}` : ""}</span>`;
      const url = `${SITE}/racing/${t.date}/${encodeURIComponent(t.meeting_id)}/${encodeURIComponent(t.race_id)}`;
      const where = t.bookie || t.bookie_price ? `<span style="color:#6b716a"> ${t.bookie_price ? price(Number(t.bookie_price)) : ""}${t.bookie ? ` at ${esc(t.bookie)}` : ""}</span>` : "";
      const flag = priceFlagged(t) ? ` <span style="color:#c47d0a;font-size:12px">(over the market price we saw)</span>` : "";
      const why = t.comment ? `<div style="margin-top:3px;font:400 13px ${FONT};color:#454a44">${esc(t.comment)}</div>` : "";
      return `<tr>${cell(`<a href="${url}" style="color:#14161a;font-weight:700;text-decoration:none">${esc(t.track)} R${t.race_number}</a>`)}${cell(`<strong>${t.tab_number}. ${esc(t.horse_name)}</strong>${why}`)}${cell(`<strong style="color:${colour}">${price(struckAt(t))}</strong>${where}${flag}`, "white-space:nowrap")}${cell(badge, "text-align:right")}</tr>`;
    })
    .join("");
  const head = (s: string, extra = "") => `<th style="padding:0 6px 6px;text-align:left;font:700 11px ${FONT};color:#8b918a;text-transform:uppercase;letter-spacing:.06em;${extra}">${s}</th>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 16px;border-collapse:collapse"><tr>${head("Race")}${head("Runner")}${head("Price")}${head("")}</tr>${body}</table>`;
}

function newTipsEmail(tipster: Tipster, tips: CreatorTip[], userId: string): EmailSpec {
  const date = tips[0].date;
  const n = tips.length;
  return {
    subject: `${tipster.name}: ${n} new ${n === 1 ? "tip" : "tips"} for ${longDate(date)}`,
    preheader: tips.map((t) => `${t.horse_name} ${price(struckAt(t))}`).join(", "),
    heading: `${tipster.name} just posted.`,
    paragraphs: [
      `${n === 1 ? "One new call" : `${n} new calls`} for ${longDate(date)}, at the price ${tipster.name} says is on offer.`,
      tipsterTable(tips),
      "Prices move, so check the live price on the race page before you bet.",
    ],
    cta: { label: `See ${tipster.name}'s tips`, url: `${SITE}/t/${tipster.code}` },
    note: `You get this because you follow ${esc(tipster.name)} and ticked tips emails. <a href="${unsubscribeUrl(userId)}" style="color:#8b918a">Unsubscribe</a> with one click.`,
  };
}

/**
 * Emails a tipster's followers about calls not yet sent. Runs a little after
 * a post so a burst of calls goes out as one email. Whoever claims the rows
 * sends; a second run finds nothing to do.
 */
export async function notifyFollowers(tipsterId: string): Promise<number> {
  const db = supabaseAdmin();
  const tipster = await tipsterById(tipsterId);
  if (!tipster) return 0;
  const { data: claimed } = await db
    .from("creator_tips")
    .update({ emailed_at: new Date().toISOString() })
    .eq("affiliate_id", tipsterId)
    .is("emailed_at", null)
    .is("settled_at", null)
    .select("*");
  const tips = ((claimed ?? []) as CreatorTip[]).sort((a, b) => a.date.localeCompare(b.date) || a.race_number - b.race_number);
  if (tips.length === 0) return 0;
  const ids = await followerIds(tipsterId);
  const { data: followers } = ids.length
    ? await db
        .from("profiles")
        .select("id, email")
        .in("id", ids)
        .eq("marketing_opt_in", true)
        .is("paused_at", null)
        .not("email", "is", null)
        .neq("id", tipster.user_id ?? "")
    : { data: [] };
  let sent = 0;
  for (const date of [...new Set(tips.map((t) => t.date))]) {
    const batch = tips.filter((t) => t.date === date);
    for (const f of (followers ?? []) as { id: string; email: string }[]) {
      if (await sendEmail(f.email, newTipsEmail(tipster, batch, f.id), { "List-Unsubscribe": `<${unsubscribeUrl(f.id)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" })) sent++;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  if (sent) await logEvent({ user_id: null, kind: "tipster_email", plan: null, amount_cents: null, meta: { tipster: tipster.code, sent, tips: tips.length } });
  return sent;
}
