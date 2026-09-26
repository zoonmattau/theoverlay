import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Responsible gambling",
  description:
    "Betting should be entertainment you can afford to lose. Free, confidential help is available 24/7 in Australia.",
};

const SUPPORT = [
  {
    name: "Gambling Help Online",
    detail: "24/7 phone and chat counselling, free and confidential.",
    phone: "1800 858 858",
    href: "https://www.gamblinghelponline.org.au",
    label: "gamblinghelponline.org.au",
  },
  {
    name: "BetStop",
    detail:
      "The national self-exclusion register. One registration blocks every licensed Australian online wagering service.",
    href: "https://www.betstop.gov.au",
    label: "betstop.gov.au",
  },
  {
    name: "Lifeline",
    detail: "Crisis support, 24 hours a day.",
    phone: "13 11 14",
    href: "https://www.lifeline.org.au",
    label: "lifeline.org.au",
  },
];

export default function Page() {
  return (
    <div className="page max-w-3xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight mt-6">
        Responsible gambling
      </h1>
      <p className="mt-4 text-ink-secondary leading-relaxed">
        Whether to bet on our numbers is your decision, and it should only ever be money
        you can afford to lose.
      </p>

      <section className="mt-10">
        <div className="panel-head">
          <h2>Get help now</h2>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SUPPORT.map((s) => (
            <li key={s.name} className="card">
              <h3 className="font-display text-lg font-bold">{s.name}</h3>
              <p className="mt-1 text-xs text-ink-secondary leading-relaxed">{s.detail}</p>
              {s.phone && (
                <p className="mt-3 nums text-xl font-semibold text-ink">
                  <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>
                </p>
              )}
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-accent underline underline-offset-2"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Signs it&apos;s stopped being entertainment
        </h2>
        <ul className="mt-4 space-y-2 text-sm text-ink-secondary leading-relaxed">
          <li>Betting to win back what you lost.</li>
          <li>Spending more than you planned, or more than you can afford.</li>
          <li>Hiding how much you bet from people close to you.</li>
          <li>Borrowing money to bet with.</li>
          <li>Feeling anxious, low or irritable when you can&apos;t bet.</li>
        </ul>
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Tools your bookmaker must offer
        </h2>
        <p className="mt-4 text-sm text-ink-secondary leading-relaxed">
          Every licensed Australian bookmaker must let you set a deposit limit, take a
          break and self-exclude, and BetStop blocks every operator at once.
        </p>
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-display text-xl font-bold tracking-tight">What we do</h2>
        <ul className="mt-4 space-y-3 text-sm text-ink-secondary leading-relaxed">
          <li>We make no promise of winning, our numbers are a guide and every bet is your own call.</li>
          <li>We recommend level stakes, one unit per selection, and never a recovery stake.</li>
          <li>We don&apos;t market to under-18s and we don&apos;t run inducements or bonus bets.</li>
        </ul>
      </section>
    </div>
  );
}
