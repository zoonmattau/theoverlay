import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for The Overlay.",
};

const UPDATED = "11 September 2026";

export default function Page() {
  return (
    <div className="page max-w-3xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight mt-6">Terms</h1>
      <p className="mt-2 text-xs text-muted">Last updated {UPDATED}</p>
      <p className="mt-4 text-ink-secondary leading-relaxed">
        Short version: we publish opinion and statistical analysis about horse racing.
        It is not financial advice, nothing is guaranteed, and any bet you place is
        your own decision and your own risk.
      </p>

      <Clause n="01" title="What this site is">
        The Overlay publishes rated prices, selections and commentary on Australian
        thoroughbred racing, produced by a statistical model and reviewed by people.
        It is general information and opinion. It is not personal, financial or
        investment advice, and it does not take your circumstances into account.
      </Clause>

      <Clause n="02" title="No guarantee">
        Racing is uncertain and every model is wrong some of the time. We do not
        guarantee any outcome, profit, strike rate or return, and past results are not a
        reliable indicator of future results. If you bet on anything we publish you
        accept the full risk of that bet.
      </Clause>

      <Clause n="03" title="Eligibility">
        You must be 18 or older to use this site. By using it you confirm that you are,
        and that using it and betting on racing is lawful where you are.
      </Clause>

      <Clause n="04" title="Prices and data">
        Market prices shown are the best prices we saw at the time a card was published.
        They move, and we do not update them in real time. We make no promise that any
        price shown is still available. Form and field data is supplied under licence
        from Form King and may contain errors; check the official race card before you
        bet.
      </Clause>

      <Clause n="05" title="Your use of our content">
        You may use what we publish for your own personal, non-commercial purposes. You
        may not scrape, republish, resell or redistribute our ratings or selections, in
        whole or in part, without our written permission.
      </Clause>

      <Clause n="06" title="Availability">
        We aim to publish every racing day, but we make no promise the site will be
        available, complete or on time. We may change, suspend or stop any part of it
        at any time.
      </Clause>

      <Clause n="07" title="Liability">
        To the extent the law allows, we exclude all liability for any loss arising from
        your use of this site or reliance on anything published on it, including betting
        losses. Nothing in these terms excludes rights you have under the Australian
        Consumer Law that cannot be excluded.
      </Clause>

      <Clause n="08" title="Responsible gambling">
        If betting is causing you harm, stop and get help. Free, confidential support is
        listed on our{" "}
        <Link
          href="/responsible-gambling"
          className="text-accent underline underline-offset-2"
        >
          responsible gambling page
        </Link>
        , including Gambling Help Online on 1800 858 858.
      </Clause>

      <Clause n="09" title="Changes">
        We may update these terms. The date at the top tells you when we last did.
        Continuing to use the site after a change means you accept the updated terms.
      </Clause>

      <Clause n="10" title="Governing law">
        These terms are governed by the laws of New South Wales, Australia.
      </Clause>

      <Clause n="11" title="Contact">
        Questions about these terms go to hello@theoverlay.com.au.
      </Clause>
    </div>
  );
}

function Clause({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
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
