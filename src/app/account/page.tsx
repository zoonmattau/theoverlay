import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signOut } from "@/app/(auth)/actions";
import { saveDetails, setTipsEmails, unlinkDiscord } from "@/app/account/actions";
import { CopyLink } from "@/components/CopyLink";
import { PortalButton } from "@/components/PortalButton";
import { FollowButton } from "@/components/FollowButton";
import { allTipsters, followedTipsters, tipsterForUser } from "@/lib/creators";
import { getViewer, type Viewer } from "@/lib/auth";
import { planById } from "@/lib/billing/plans";
import { longDate } from "@/lib/format";
import { discordLinkConfigured } from "@/lib/discord";
import { getTodayCard } from "@/lib/model/source";
import { BONUS_DAYS, ensureReferralCode, referralCount } from "@/lib/referrals";
import { BRAND_SOCIAL } from "@/lib/social";

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

/** The pages of the account, in menu order. */
const TABS = ["overview", "plan", "passes", "discord", "tipsters", "invite", "details", "settings", "admin"] as const;
type Tab = (typeof TABS)[number];

/**
 * The account as a menu: one thing per page, the menu saying what each one
 * is and where it stands, and an overview that points to whatever needs
 * doing. ?tab= picks the page.
 */
async function Account({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  if (!viewer.id && viewer.plan !== "open") redirect("/login?next=/account");
  const [card, code, invited] = await Promise.all([
    getTodayCard(viewer.admin),
    viewer.id ? (viewer.referralCode ?? ensureReferralCode(viewer.id)) : Promise.resolve(""),
    viewer.id ? referralCount(viewer.id) : Promise.resolve(0),
  ]);
  const plan = planById(viewer.plan);
  const [tipsters, following, runs] = await Promise.all([allTipsters(), followedTipsters(viewer), tipsterForUser(viewer.id)]);
  const followingIds = new Set(following.map((t) => t.id));
  const now = new Date(card.builtAt).getTime() || 0;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
  const tab: Tab = TABS.includes(sp.tab as Tab) && (sp.tab !== "admin" || viewer.admin) ? (sp.tab as Tab) : "overview";
  const renews = viewer.pro && viewer.accessUntil ? longDate(viewer.accessUntil.slice(0, 10)) : undefined;

  const status = viewer.admin
    ? { label: "Admin", cls: "badge-prime" }
    : viewer.paused
      ? { label: "Paused", cls: "badge-warn" }
      : viewer.pro
        ? { label: plan?.name ?? "Member", cls: "badge-prime" }
        : viewer.bonusLive
          ? { label: "Gift access", cls: "badge-prime" }
          : { label: "No plan", cls: "badge-muted" };

  // What the menu says under each name: where that thing stands right now.
  const hint: Record<Tab, string> = {
    overview: "Where everything is",
    plan: viewer.admin ? "Every day open" : viewer.paused ? "Paused" : viewer.pro ? `${plan?.name ?? "Member"}${renews ? `, renews ${renews}` : ""}` : viewer.bonusLive ? `Gift until ${longDate(viewer.bonusUntil!.slice(0, 10))}` : "No plan yet",
    passes: viewer.passCredits ? `${viewer.passCredits} unused` : "None unused",
    discord: viewer.discordName ? `Linked as ${viewer.discordName}` : "Not linked",
    tipsters: following.length ? `Following ${following.length}` : "Following nobody",
    invite: invited ? `${invited} joined` : "Share your link",
    details: viewer.details.fullName ? viewer.details.fullName : "Name and address",
    settings: `Tips email ${viewer.tipsEmails ? "on" : "off"}`,
    admin: "Preview a date",
  };
  const label: Record<Tab, string> = { overview: "Overview", plan: "Plan and billing", passes: "Day passes", discord: "Discord", tipsters: "Tipsters", invite: "Invite a friend", details: "Your details", settings: "Email and password", admin: "Admin" };
  const menu = TABS.filter((t) => t !== "admin" || viewer.admin);

  return (
    <>
      {sp.password === "updated" && <Notice>Password updated.</Notice>}
      {sp.offer === "taken" && <Notice>Done, your first month is half price. Glad you stayed.</Notice>}
      {sp.discord === "linked" && <Notice>Discord linked. You are in the server and the Members area opens while your plan is live.</Notice>}
      {sp.discord === "taken" && <Notice>That Discord account is already linked to another member.</Notice>}
      {sp.discord === "failed" && <Notice>Discord did not link. Try again.</Notice>}
      {sp.checkout === "success" && <Notice>You are in. Your plan shows below within a few seconds, refresh if it has not.</Notice>}
      {sp.checkout === "passes" && <Notice>Passes bought. They show below within a few seconds, refresh if they have not.</Notice>}

      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Signed in as</div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 break-all">{viewer.email ?? "Open mode"}</h1>
        </div>
        <span className={`badge ${status.cls} text-sm px-3 py-1`}>{status.label}</span>
      </section>

      <div className="account">
        <nav className="account-menu" aria-label="Account">
          {menu.map((t) => (
            <Link key={t} href={t === "overview" ? "/account" : `/account?tab=${t}`} className={`account-item ${tab === t ? "is-current" : ""}`} aria-current={tab === t ? "page" : undefined} scroll={false}>
              <span className="account-item-name">{label[t]}</span>
              <span className="account-item-hint">{hint[t]}</span>
            </Link>
          ))}
        </nav>

        <div className="account-body">
          {tab === "overview" && <Overview viewer={viewer} plan={plan} renews={renews} following={following.length} invited={invited} runs={Boolean(runs)} now={now} />}

          {tab === "plan" && (
            <Panel title="Plan and billing" blurb="Your plan opens the full board on its race days: every runner rated, every bet and lay.">
              {viewer.admin ? (
                <>
                  <p className="text-sm text-ink-secondary">Every race day is open, nothing to pay.</p>
                  <Link href="/admin" className="btn btn-secondary btn-sm mt-3">Open admin</Link>
                </>
              ) : viewer.pro ? (
                <>
                  <div className="grid grid-cols-2 gap-3 max-w-md">
                    <Tile n={plan?.name ?? viewer.plan ?? "Member"} label="plan" tone="prime" />
                    <Tile n={viewer.accessUntil ? `${daysUntil(viewer.accessUntil, now)}d` : "—"} label={renews ? `renews ${renews}` : "no renewal"} />
                  </div>
                  <p className="mt-3 text-sm text-ink-secondary">{plan?.days.length ? `Opens ${plan.name} race days.` : "Opens every race day."}{viewer.paused ? " Paused: nothing is charged and the board is closed until it resumes." : ""}</p>
                  <Row label="Payment, invoices and card" what="Stripe holds your card and every invoice.">{viewer.stripeCustomerId && <PortalButton />}</Row>
                  <Row label="Change plan" what="Move to more days or fewer. The change starts at your next renewal."><Link href="/pricing" className="btn btn-secondary btn-sm">See plans</Link></Row>
                  {viewer.stripeCustomerId && <Row label="Cancel" what="Your plan runs to the end of the period you paid for, then stops."><Link href="/account/cancel" className="btn btn-secondary btn-sm">Cancel plan</Link></Row>}
                </>
              ) : (
                <>
                  <p className="text-sm text-ink-secondary">No plan yet. Pick the days you bet and try it free for seven days.{viewer.bonusLive ? ` Your gift access runs until ${longDate(viewer.bonusUntil!.slice(0, 10))}.` : ""}</p>
                  <Link href="/pricing" className="btn btn-primary btn-sm mt-3">Start free trial</Link>
                </>
              )}
            </Panel>
          )}

          {tab === "passes" && (
            <Panel title="Day passes" blurb="A pass opens every race on one date of your choice and never expires. For the days your plan does not cover.">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <Tile n={viewer.passCredits} label={viewer.passCredits === 1 ? "pass unused" : "passes unused"} tone={viewer.passCredits ? "bet" : undefined} />
                <Tile n={viewer.passDates.length} label="used" />
              </div>
              {viewer.passDates.length > 0 && <p className="mt-3 text-xs text-ink-soft">Used on {viewer.passDates.slice(0, 6).map((d) => longDate(d)).join(", ")}{viewer.passDates.length > 6 ? " and more" : ""}.</p>}
              <Row label="Buy passes" what="Bought in ones or bundles, used from any locked race page."><Link href="/pricing#passes" className="btn btn-secondary btn-sm">Buy passes</Link></Row>
              <Row label="Use one" what="Open any race on a locked day and press Use a pass. It opens the whole day." />
            </Panel>
          )}

          {tab === "discord" && (
            <Panel title="Discord" blurb="The calls, the winners and the results post to the server through the day. The Members area opens while your plan is live.">
              {viewer.discordName ? (
                <>
                  <p className="text-sm">Linked as <strong>{viewer.discordName}</strong>.</p>
                  <Row label="Open the server" what="Bets and lays, Primes, winners, results and the free race."><a href={BRAND_SOCIAL.discord} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Open Discord</a></Row>
                  <Row label="Unlink" what="Takes the Member role off that account. You can link another."><form action={unlinkDiscord}><button type="submit" className="btn btn-secondary btn-sm">Unlink</button></form></Row>
                </>
              ) : (
                <Row label="Link your Discord" what="Joins you to the server and gives you the Member role while your plan is live.">
                  {discordLinkConfigured() ? <a href="/api/discord/link" className="btn btn-primary btn-sm">Link Discord</a> : <a href={BRAND_SOCIAL.discord} target="_blank" rel="noopener" className="btn btn-primary btn-sm">Join the Discord</a>}
                </Row>
              )}
            </Panel>
          )}

          {tab === "tipsters" && (
            <Panel title="Tipsters" blurb="Follow as many as you like. Their calls show next to the model's on every race and in your tips email.">
              {runs && (
                <Row label={`You post as ${runs.name}`} what="Your page, your record and the form to post a call."><Link href="/tipster" className="btn btn-secondary btn-sm">Your tips</Link></Row>
              )}
              <Row label="Everyone's record" what="Ranked on the last 30 days, every call they post, why you would follow each."><Link href="/tipsters" className="btn btn-secondary btn-sm">See the tipsters</Link></Row>
              {tipsters.length > 0 && (
                <ul className="divide-y divide-line-soft text-sm mt-4">
                  {tipsters.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <Link href={`/t/${t.code}`} className="font-semibold hover:text-blue">{t.name}</Link>
                        {t.blurb && <span className="block text-xs text-ink-soft truncate">{t.blurb}</span>}
                      </span>
                      <FollowButton code={t.code} following={followingIds.has(t.id)} small />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {tab === "invite" && (
            <Panel title="Invite a friend" blurb={`Send your link. When a friend starts a plan you both get ${BONUS_DAYS} days of the full board.`}>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <Tile n={invited} label={invited === 1 ? "friend joined" : "friends joined"} tone={invited ? "prime" : undefined} />
                <Tile n={`${BONUS_DAYS}d`} label="each, per friend" />
              </div>
              <div className="mt-4">{code && <CopyLink link={`${site}/join/${code}`} />}</div>
            </Panel>
          )}

          {tab === "details" && (
            <Panel title="Your details" blurb="Name, mobile, date of birth and address. Needed once for the account, never shown to anyone.">
              <form action={saveDetails} className="grid grid-cols-2 gap-3 text-sm max-w-xl">
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
                <div className="col-span-2"><button type="submit" className="btn btn-primary btn-sm">Save details</button></div>
              </form>
            </Panel>
          )}

          {tab === "settings" && (
            <Panel title="Email and password" blurb="The morning email, your password, and signing out.">
              <Row label="Morning tips email" what={`${viewer.tipsEmails ? "On" : "Off"}. Sent at 11am on your race days with every call and the free race.`}>
                <form action={setTipsEmails}>
                  <input type="hidden" name="on" value={viewer.tipsEmails ? "0" : "1"} />
                  <button type="submit" className="btn btn-secondary btn-sm">{viewer.tipsEmails ? "Turn off" : "Turn on"}</button>
                </form>
              </Row>
              <Row label="Password" what="We email you a link to set a new one."><Link href="/reset" className="btn btn-secondary btn-sm">Change password</Link></Row>
              <Row label="Log out" what="Signs this browser out. Your plan carries on."><form action={signOut}><button type="submit" className="btn btn-secondary btn-sm">Log out</button></form></Row>
              <p className="mt-4 text-xs text-ink-soft">Need a hand? <a href="mailto:hello@theoverlay.com.au" className="text-blue">hello@theoverlay.com.au</a></p>
            </Panel>
          )}

          {tab === "admin" && viewer.admin && (
            <Panel title="Admin" blurb="Open the board or the tips for any date, including tomorrow once the 9pm build has run. Members only ever see today, from 8am.">
              <form action="/" method="get" className="flex flex-wrap items-end gap-3 text-sm">
                <label className="field"><span>Date</span><input name="date" type="date" defaultValue={card.date} className="field-input" /></label>
                <button type="submit" className="btn btn-primary btn-sm">Open board</button>
                <button type="submit" formAction="/tips" className="btn btn-secondary btn-sm">Open tips</button>
              </form>
              <Row label="Admin pages" what="Members, money, affiliates, activity and the review."><Link href="/admin" className="btn btn-secondary btn-sm">Open admin</Link></Row>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

/** The first page: what you have, and the one thing to do next if there is one. */
function Overview({ viewer, plan, renews, following, invited, runs, now }: { viewer: Viewer; plan: ReturnType<typeof planById>; renews?: string; following: number; invited: number; runs: boolean; now: number }) {
  // The nudge: the thing most worth doing from here, if anything.
  const nudge = !viewer.pro && !viewer.admin && !viewer.bonusLive
    ? { text: "No plan yet. Seven days free to start.", href: "/pricing", cta: "Start free trial" }
    : viewer.paused
      ? { text: "Your plan is paused, so the board is closed.", href: "/account?tab=plan", cta: "Resume it" }
      : !viewer.discordName
        ? { text: "Link your Discord to get the calls as they post and the winners as they land.", href: "/account?tab=discord", cta: "Link Discord" }
        : following === 0
          ? { text: "Follow a tipster and their calls sit next to the model's on every race.", href: "/tipsters", cta: "See the tipsters" }
          : undefined;
  return (
    <div className="space-y-4">
      {nudge && (
        <div className="card border-lime bg-lime-soft flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">{nudge.text}</span>
          <Link href={nudge.href} className="btn btn-primary btn-sm ml-auto">{nudge.cta}</Link>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile n={plan ? plan.name : viewer.admin ? "All days" : "None"} label="plan" tone={viewer.pro || viewer.admin ? "prime" : undefined} />
        <Tile n={viewer.pro && viewer.accessUntil ? `${daysUntil(viewer.accessUntil, now)}d` : "—"} label={renews ? `renews ${renews}` : "no renewal"} />
        <Tile n={viewer.passCredits} label={viewer.passCredits === 1 ? "day pass" : "day passes"} tone={viewer.passCredits ? "bet" : undefined} />
        <Tile n={viewer.bonusLive ? `${daysUntil(viewer.bonusUntil, now)}d` : "0d"} label="gifted access" />
      </div>
      <div className="card">
        <h2 className="font-display font-extrabold">Where things are</h2>
        <ul className="divide-y divide-line-soft text-sm mt-2">
          <Where href="/account?tab=plan" name="Plan and billing" what="Card, invoices, change or cancel the plan." />
          <Where href="/account?tab=passes" name="Day passes" what="Buy them here, use them from any locked race page." />
          <Where href="/account?tab=discord" name="Discord" what={viewer.discordName ? `Linked as ${viewer.discordName}.` : "Link your account to join the server."} />
          <Where href="/account?tab=tipsters" name="Tipsters" what={`${following ? `Following ${following}.` : "Following nobody yet."}${runs ? " You post tips too." : ""}`} />
          <Where href="/account?tab=invite" name="Invite a friend" what={`${BONUS_DAYS} days each when a friend starts a plan. ${invited} joined so far.`} />
          <Where href="/account?tab=details" name="Your details" what="Name, mobile, date of birth, address." />
          <Where href="/account?tab=settings" name="Email and password" what={`Tips email ${viewer.tipsEmails ? "on" : "off"}. Change your password or log out.`} />
        </ul>
      </div>
    </div>
  );
}

function Where({ href, name, what }: { href: string; name: string; what: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 py-2.5 hover:text-blue" scroll={false}>
        <span className="font-semibold w-40 shrink-0">{name}</span>
        <span className="text-ink-secondary min-w-0">{what}</span>
        <span className="ml-auto text-ink-soft">→</span>
      </Link>
    </li>
  );
}

/** One page of the account: a heading, one line on what it is for, then its rows. */
function Panel({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="font-display text-xl font-extrabold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-ink-secondary max-w-2xl">{blurb}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** One thing you can do: what it is called, what it does, and the button that does it. */
function Row({ label, what, children }: { label: string; what: string; children?: React.ReactNode }) {
  return (
    <div className="account-row">
      <div className="min-w-0">
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-sm text-ink-secondary">{what}</div>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
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
    <div className={`stat text-center ${cls}`}>
      <div className="font-display text-2xl font-extrabold tracking-tight nums truncate">{n}</div>
      <div className="stat-label mt-1">{label}</div>
    </div>
  );
}
