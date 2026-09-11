import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Split layout for the account pages: the brand on the left on graphite, the
 * form on the right. The left panel folds away on a phone.
 */
export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="page">
      <div className="section grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] mt-6 max-w-4xl mx-auto">
        <aside className="hidden md:flex flex-col justify-between p-8 bg-bar text-bar-ink">
          <Link href="/" className="inline-block">
            <Image src="/brand/lockup-dark.png" alt="The Overlay" width={1252} height={322} className="h-12 w-auto" priority />
          </Link>
          <div>
            <p className="font-display text-3xl font-extrabold tracking-tight leading-[1.05]">
              The market has an opinion.
              <br />
              <span className="text-lime">We have the data.</span>
            </p>
            <ul className="mt-6 space-y-2 text-sm text-bar-soft">
              <li>Every runner rated, every race.</li>
              <li>A price for every horse, next to the live price.</li>
              <li>Clear calls: bet, lay, or leave it alone.</li>
            </ul>
          </div>
          <p className="text-xs text-bar-soft">18+ only. Gamble responsibly. Gambling Help Online 1800 858 858.</p>
        </aside>
        <div className="p-6 sm:p-8">
          <Link href="/" className="md:hidden inline-block mb-5">
            <Image src="/brand/lockup-light-stacked.png" alt="The Overlay" width={1240} height={984} className="h-14 w-auto" priority />
          </Link>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">{title}</h1>
          {intro && <p className="mt-1 mb-5 text-sm text-ink-soft">{intro}</p>}
          {!intro && <div className="mb-5" />}
          {children}
        </div>
      </div>
    </div>
  );
}
