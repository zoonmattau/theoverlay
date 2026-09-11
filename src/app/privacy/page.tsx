import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How The Overlay collects, uses and stores your information.",
};

const UPDATED = "11 September 2026";

export default function Page() {
  return (
    <div className="page max-w-3xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight mt-6">Privacy</h1>
      <p className="mt-2 text-xs text-muted">Last updated {UPDATED}</p>
      <p className="mt-4 text-ink-secondary leading-relaxed">
        Short version: we keep the minimum we need to run your account, we never sell it, and you can ask us to delete it any time.
      </p>

      <Clause n="01" title="What we collect">
        Your email address and password when you sign up, the plan or passes you buy, the invite code you used, and basic usage such as which pages and plans you click.
      </Clause>

      <Clause n="02" title="Payments">
        Card details go straight to Stripe and never touch our servers. We keep a Stripe customer reference, what you paid and when, so we can show it on your account and support you.
      </Clause>

      <Clause n="03" title="Emails">
        We send account emails such as sign-up confirmation, receipts and trial notices. Tips and news emails only go out if you ticked the box, and every one has an unsubscribe link.
      </Clause>

      <Clause n="04" title="Who we share with">
        Supabase hosts accounts, Stripe handles payments, Resend delivers email and Vercel hosts the site. Each sees only what it needs to do its job, and none of them may use your data for anything else.
      </Clause>

      <Clause n="05" title="Cookies">
        A session cookie keeps you logged in and a small local setting remembers which sections you collapsed. We also use the Meta Pixel to measure our ads, which sets a Meta cookie you can block in your browser or through your Facebook ad settings.
      </Clause>

      <Clause n="06" title="Your rights">
        You can see, correct or delete your information by emailing{" "}
        <a href="mailto:hello@theoverlay.com.au" className="text-blue">hello@theoverlay.com.au</a>, and deleting your account removes everything except payment records we must keep for tax.
      </Clause>

      <Clause n="07" title="Age">
        The site is for people 18 and over, and we remove any account we find belongs to someone younger.
      </Clause>

      <p className="mt-8 text-sm text-ink-soft">
        See also the <Link href="/terms" className="text-blue">terms</Link> and our <Link href="/responsible-gambling" className="text-blue">responsible gambling</Link> page.
      </p>
    </div>
  );
}

function Clause({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 border-t border-line pt-5">
      <div className="flex items-baseline gap-3">
        <span className="nums text-xs text-accent">{n}</span>
        <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
      </div>
      <p className="mt-2 text-sm text-ink-secondary leading-relaxed">{children}</p>
    </section>
  );
}
