import { Suspense, type ReactNode } from "react";

import { AuthRecord } from "@/components/AuthRecord";

/** What a member gets, a bold lead and the rest. */
const POINTS: [string, string][] = [
  ["Every runner rated.", "A top four and ratings in every race we cover."],
  ["A price on every horse.", "Our rated price beside the live market."],
  ["Clear calls.", "Bet, lay, or leave it alone, before the jump."],
];

/**
 * Split layout for the account pages: the brand on the left on graphite, the
 * form on the right. The left panel folds away on a phone.
 */
export function AuthShell({
  title,
  intro,
  pitch,
  children,
}: {
  title: string;
  intro?: string;
  /** Live line under the brand on the left, and above the form on a phone. */
  pitch?: { aside: ReactNode; inline: ReactNode };
  children: ReactNode;
}) {
  return (
    <div className="page">
      <div className="section grid grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] mt-6 max-w-4xl mx-auto">
        {/* Headline, what you get, the record, today: together at the top, the small print at the foot. The logo is in the top bar already. */}
        <aside className="hidden md:flex flex-col gap-6 p-8 bg-bar text-bar-ink">
          <p className="font-display text-3xl font-extrabold tracking-tight leading-[1.05]">
            The market has an opinion.
            <br />
            <span className="text-lime">We have the data.</span>
          </p>
          <ul className="space-y-3.5 text-[15px] leading-snug text-bar-soft">
            {POINTS.map(([lead, rest]) => (
              <li key={lead} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime text-[11px] font-black text-ink" aria-hidden>
                  ✓
                </span>
                <span>
                  <strong className="font-semibold text-bar-ink">{lead}</strong> {rest}
                </span>
              </li>
            ))}
          </ul>
          <Suspense fallback={null}>
            <AuthRecord />
          </Suspense>
          {pitch && <div>{pitch.aside}</div>}
          <div className="mt-auto space-y-3 pt-2">
            <div className="flex flex-wrap gap-2">
              {["7-day free trial", "Cancel any time"].map((t) => (
                <span key={t} className="rounded-full border border-lime/40 px-2.5 py-1 text-xs font-semibold text-lime">{t}</span>
              ))}
            </div>
            <p className="text-xs text-bar-soft">18+ only. Gamble responsibly. Gambling Help Online 1800 858 858.</p>
          </div>
        </aside>
        <div className="p-6 sm:p-8">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">{title}</h1>
          {intro && <p className="mt-1 mb-5 text-sm text-ink-soft">{intro}</p>}
          {!intro && <div className="mb-5" />}
          {pitch && <div className="md:hidden mb-5">{pitch.inline}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}
