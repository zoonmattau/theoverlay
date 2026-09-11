import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signOut } from "@/app/(auth)/actions";
import { saveDetails, setTipsEmails } from "@/app/account/actions";
import { CopyLink } from "@/components/CopyLink";
import { PortalButton } from "@/components/PortalButton";
import { getViewer } from "@/lib/auth";
import { planById } from "@/lib/billing/plans";
import { longDate } from "@/lib/format";
import { getTodayCard } from "@/lib/model/source";
import { BONUS_DAYS, ensureReferralCode, referralCount } from "@/lib/referrals";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/account">) {
  return (
    <div className="page max-w-5xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Account searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const DAY = 86400_000;
const daysUntil = (iso: string | undefined, now: number) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / DAY)) : 0);

async function Account({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  if (!viewer.id && viewer.plan !== "open") redirect("/login?next=/account");
  const [card, code, invited] = await Promise.all([
    getTodayCard(viewer.admin),
    viewer.id ? (viewer.referralCode ?? ensureReferralCode(viewer.id)) : Promise.resolve(""),
    viewer.id ? referralCount(viewer.id) : Promise.resolve(0),
  ]);
  const plan = planById(viewer.plan);
  const now = new Date(card.builtAt).getTime() || 0;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
  const status = viewer.admin
    ? { label: "Admin", cls: "badge-prime" }
    : viewer.paused
      ? { label: "Paused", cls: "badge-warn" }
      : viewer.pro
        ? { label: plan?.name ?? "Member", cls: "badge-prime" }
        : viewer.bonusLive
          ? { label: "Gift access", cls: "badge-prime" }
          : { label: "No plan", cls: "badge-muted" };

  return (
    <>
      {sp.password === "updated" && <Notice>Password updated.</Notice>}
      {sp.checkout === "success" && <Notice>You are in. Your plan shows below within a few seconds, refresh if it has not.</Notice>}
      {sp.checkout === "passes" && <Notice>Passes bought. They show below within a few seconds, refresh if they have not.</Notice>}

      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Signed in as</div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mt-1 break-all">{viewer.email ?? "Open mode"}</h1>
        </div>
        <span className={`badge ${status.cls} text-sm px-3 py-1`}>{status.label}</span>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile n={plan ? plan.name : viewer.admin ? "All days" : "None"} label="plan" tone={viewer.pro || viewer.admin ? "prime" : undefined} />
        <Tile
          n={viewer.pro && viewer.accessUntil ? `${daysUntil(viewer.accessUntil, now)}d` : "—"}
          label={viewer.pro && viewer.accessUntil ? `renews ${longDate(viewer.accessUntil.slice(0, 10))}` : "no renewal"}
        />
        <Tile n={viewer.passCredits} label={viewer.passCredits === 1 ? "day pass unused" : "day passes unused"} tone={viewer.passCredits ? "bet" : undefined} />
        <Tile
          n={viewer.bonusLive ? `${daysUntil(viewer.bonusUntil, now)}d` : "0d"}
          label={viewer.bonusLive ? `gift until ${longDate(viewer.bonusUntil!.slice(0, 10))}` : "gifted access"}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="Subscription">
          {viewer.admin ? (
            <>
              <p className="text-sm text-ink-secondary">Every race day is open, nothing to pay.</p>
              <Link href="/admin" className="btn btn-secondary btn-sm mt-3">Open admin</Link>
            </>
          ) : viewer.pro ? (
            <>
              <p className="text-sm text-ink-secondary">
                <strong>{plan?.name ?? viewer.plan}</strong>, {plan?.days.length ? `opens ${plan.name} race days` : "opens every race day"}
                {viewer.accessUntil ? `, renews ${longDate(viewer.accessUntil.slice(0, 10))}` : ""}.
              </p>
              {viewer.paused && <p className="mt-1 text-sm text-red font-semibold">Paused, nothing is charged and the board is closed until it resumes.</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {viewer.stripeCustomerId && <PortalButton />}
                <Link href="/pricing" className="btn btn-secondary btn-sm">Change plan</Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-secondary">No plan yet. Pick the days you bet and try it free for seven days.</p>
              <Link href="/pricing" className="btn btn-primary btn-sm mt-3">Start free trial</Link>
            </>
          )}
        </Card>

        <Card title="Day passes">
          <p className="text-sm text-ink-secondary">
            <strong>{viewer.passCredits}</strong> {viewer.passCredits === 1 ? "pass" : "passes"} unused, each one opens every race on a date of your choice and never expires.
          </p>
          {viewer.passDates.length > 0 && (
            <p className="mt-1 text-xs text-ink-soft">
              Used on {viewer.passDates.slice(0, 4).map((d) => longDate(d)).join(", ")}
              {viewer.passDates.length > 4 ? " and more" : ""}.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/pricing#passes" className="btn btn-secondary btn-sm">Buy passes</Link>
          </div>
        </Card>

        <Card title="Invite a friend">
          <p className="text-sm text-ink-secondary">
            Send your link and you both get {BONUS_DAYS} days of the full board. <strong>{invited}</strong> {invited === 1 ? "friend has" : "friends have"} joined so far.
          </p>
          {code && <CopyLink link={`${site}/join/${code}`} />}
        </Card>

        <Card title="Your details">
          <form action={saveDetails} className="grid grid-cols-2 gap-3 text-sm">
            <label className="field col-span-2"><span>Full name</span><input name="fullName" defaultValue={viewer.details.fullName} autoComplete="name" className="field-input" /></label>
            <label className="field"><span>Mobile</span><input name="phone" defaultValue={viewer.details.phone} autoComplete="tel" className="field-input" /></label>
            <label className="field"><span>Date of birth</span><input name="dob" type="date" defaultValue={viewer.details.dob} autoComplete="bday" className="field-input" /></label>
            <label className="field col-span-2"><span>Address</span><input name="address1" defaultValue={viewer.details.address1} autoComplete="address-line1" className="field-input" /></label>
            <label className="field col-span-2"><span>Address line 2</span><input name="address2" defaultValue={viewer.details.address2} autoComplete="address-line2" className="field-input" /></label>
            <label className="field"><span>Suburb</span><input name="suburb" defaultValue={viewer.details.suburb} autoComplete="address-level2" className="field-input" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field"><span>State</span>
                <select name="state" defaultValue={viewer.details.state} className="field-input">
                  <option value="">—</option>
                  {["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"].map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              </label>
              <label className="field"><span>Postcode</span><input name="postcode" defaultValue={viewer.details.postcode} inputMode="numeric" maxLength={4} autoComplete="postal-code" className="field-input" /></label>
            </div>
            <div className="col-span-2"><button type="submit" className="btn btn-secondary btn-sm">Save details</button></div>
          </form>
        </Card>

        <Card title="Settings">
          <form action={setTipsEmails} className="flex flex-wrap items-center gap-3 text-sm">
            <input type="hidden" name="on" value={viewer.tipsEmails ? "0" : "1"} />
            <span className="text-ink-secondary">
              Morning tips email is <strong>{viewer.tipsEmails ? "on" : "off"}</strong>, sent at 8am on your race days.
            </span>
            <button type="submit" className="btn btn-secondary btn-sm">{viewer.tipsEmails ? "Turn off" : "Turn on"}</button>
          </form>
          <p className="mt-3 text-sm text-ink-secondary">Change your password, or sign out of this browser.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/reset" className="btn btn-secondary btn-sm">Change password</Link>
            <form action={signOut}>
              <button type="submit" className="btn btn-secondary btn-sm">Log out</button>
            </form>
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            Need a hand? <a href="mailto:hello@theoverlay.com.au" className="text-blue">hello@theoverlay.com.au</a>
          </p>
        </Card>
      </div>
    </>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="card border-lime bg-lime-soft mt-6">
      <p className="font-semibold">{children}</p>
    </div>
  );
}

function Tile({ n, label, tone }: { n: number | string; label: string; tone?: "prime" | "bet" }) {
  const cls = tone === "prime" ? "border-lime bg-lime-soft" : tone === "bet" ? "border-blue bg-blue-soft" : "";
  return (
    <div className={`card text-center ${cls}`}>
      <div className="font-display text-2xl font-extrabold tracking-tight nums truncate">{n}</div>
      <div className="text-[10px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="font-display font-extrabold">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}
