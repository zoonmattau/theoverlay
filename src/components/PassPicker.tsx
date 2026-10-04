"use client";

import { useState } from "react";

import { CheckoutButton } from "@/components/CheckoutButton";

/**
 * Day passes as one card under the plans: pick how many, see the price and
 * the saving, one button. Four separate cards, each with its own button, sat
 * like a second pricing table and read as clutter (4 Oct 2026).
 */
export function PassPicker({ bundles, single, signedIn }: { bundles: { qty: number; price: number }[]; single: number; signedIn: boolean }) {
  const [qty, setQty] = useState(bundles[1]?.qty ?? bundles[0].qty);
  const b = bundles.find((x) => x.qty === qty)!;
  const each = b.price / b.qty;
  const saving = Math.round((1 - each / single) * 100);

  return (
    <div className="mt-10 rounded-[var(--radius-lg)] border border-line bg-panel p-5 shadow-card scroll-mt-24" id="passes">
      {/* Three columns on a wide screen, words, tiles, price, so nothing leaves a gap; stacked on a phone. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center lg:gap-6">
        <div>
          <h2 className="font-display text-lg font-extrabold tracking-tight">Just a day here and there?</h2>
          <p className="mt-0.5 text-sm text-ink-secondary text-balance">
            A day pass opens every race on one race day, any day you choose. No subscription, and they never expire.
          </p>
        </div>

          {/* One size of type in every tile: the count, its price, the saving. */}
          <div role="radiogroup" aria-label="How many passes" className="grid grid-cols-4 gap-2 lg:w-[26rem]">
            {bundles.map((x) => {
              const on = x.qty === qty;
              const off = Math.round((1 - x.price / x.qty / single) * 100);
              return (
                <button
                  key={x.qty}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setQty(x.qty)}
                  className={`rounded-md border px-1 py-2 text-center text-xs leading-snug transition-colors ${on ? "border-ink bg-ink text-white" : "border-line bg-panel hover:border-ink-soft"}`}
                >
                  {/* In days, what a pass is: "10 passes" wrapped onto two lines in a phone's quarter width. */}
                  <span className="block whitespace-nowrap text-sm font-bold tabular-nums">
                    {x.qty} {x.qty === 1 ? "day" : "days"}
                  </span>
                  <span className={`block tabular-nums ${on ? "text-white/75" : "text-ink-soft"}`}>${x.price}</span>
                  <span className={`block ${off > 0 ? `font-bold ${on ? "text-lime" : "text-accent"}` : on ? "text-white/75" : "text-ink-soft"}`}>{off > 0 ? `Save ${off}%` : "Full price"}</span>
                </button>
              );
            })}
          </div>

        <div className="lg:w-56 lg:border-l lg:border-line lg:pl-6">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-3xl font-extrabold tracking-tight tabular-nums">${b.price}</span>
            <span className="text-sm text-ink-soft">one-off</span>
          </div>
          <div className="mt-0.5 text-sm text-ink-secondary tabular-nums">
            ${each.toFixed(2)} a day{saving > 0 ? <>, <span className="font-semibold text-accent">save ${b.qty * single - b.price}</span></> : null}
          </div>
          <CheckoutButton
            passes={b.qty}
            signedIn={signedIn}
            label={`Buy ${b.qty === 1 ? "a day pass" : `${b.qty} day passes`}`}
            className="btn btn-secondary w-full mt-3"
          />
        </div>
      </div>
    </div>
  );
}
