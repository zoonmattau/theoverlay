import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";

/**
 * The month's Form King credits. The bundle renews on the 12th (the bill
 * date), so the 11th is the last day to spend what is left: on full careers,
 * saved for good (the user, 12 Oct 2026). Counted from the daily meters, the
 * site's (spend:<day>) and local scripts' (spend-local:<day>); credits bought
 * on top of the bundle are not known here, so "left" is the bundle's.
 */
export const RENEWS_ON = 12;
export const MONTHLY_CREDITS = Number(process.env.FORMKING_MONTHLY_CREDITS ?? 30000);

const sydneyDay = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

/** The first day of the current billing period, yyyy-mm-dd. */
export function periodStart(today = sydneyDay(Date.now())): string {
  const [y, m, d] = today.split("-").map(Number);
  const start = d >= RENEWS_ON ? new Date(Date.UTC(y, m - 1, RENEWS_ON)) : new Date(Date.UTC(y, m - 2, RENEWS_ON));
  return start.toISOString().slice(0, 10);
}

/** Is today the last day of the period? */
export const lastDayOfPeriod = (today = sydneyDay(Date.now())) => Number(today.slice(8, 10)) === RENEWS_ON - 1;

export interface CreditsUsed {
  since: string;
  site: number;
  local: number;
  used: number;
  left: number;
}

export async function creditsThisPeriod(): Promise<CreditsUsed> {
  const today = sydneyDay(Date.now());
  const since = periodStart(today);
  const { data } = await supabaseAdmin().from("fk_cache").select("key, data").eq("kind", "spend").gte("key", "spend").lte("key", "spend~");
  let site = 0;
  let local = 0;
  for (const r of (data ?? []) as { key: string; data: { credits?: number } }[]) {
    const [kind, day] = r.key.split(":");
    if (!day || day < since || day > today) continue;
    if (kind === "spend") site += r.data?.credits ?? 0;
    else if (kind === "spend-local") local += r.data?.credits ?? 0;
  }
  const used = Math.round(site + local);
  return { since, site: Math.round(site), local: Math.round(local), used, left: Math.max(0, MONTHLY_CREDITS - used) };
}

/** The command that spends what is left on full careers. */
export const spendCommand = (credits: number) => `npx tsx --conditions=react-server --env-file=.env.local scripts/use-credits.ts ${credits}`;

/**
 * On the 11th, once: tells the admins what is left and how to spend it.
 * Run from the midday cron. Returns whether it sent.
 */
export async function remindCredits(): Promise<boolean> {
  if (!lastDayOfPeriod()) return false;
  const c = await creditsThisPeriod();
  const db = supabaseAdmin();
  const { data: sent } = await db.from("events").select("id").eq("kind", "credits_reminder").eq("meta->>since", c.since).limit(1);
  if (sent?.length) return false;
  const { sendEmail } = await import("@/lib/email/send");
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const spend = Math.max(0, c.left - 200);
  for (const to of admins) {
    await sendEmail(to, {
      subject: `Form King renews tomorrow: about ${c.left.toLocaleString("en-AU")} credits left`,
      preheader: "Spend them on full careers today, saved for good.",
      heading: "Use the credits before they reset.",
      paragraphs: [
        `Since the ${new Date(`${c.since}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}, about <strong>${c.used.toLocaleString("en-AU")}</strong> of the ${MONTHLY_CREDITS.toLocaleString("en-AU")} credits have gone (${c.site.toLocaleString("en-AU")} by the site, ${c.local.toLocaleString("en-AU")} by scripts). Top-ups are not counted.`,
        `Spend about <strong>${spend.toLocaleString("en-AU")}</strong> on full careers (2 credits a horse, every run kept), leaving 200 for tonight's card. From the project folder:`,
        `<code>${spendCommand(spend)}</code>`,
      ],
    });
  }
  await db.from("events").insert({ user_id: null, kind: "credits_reminder", plan: null, amount_cents: null, meta: { since: c.since, used: c.used, left: c.left } });
  return true;
}
