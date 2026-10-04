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
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <h2 className="font-display text-xl font-extrabold tracking-tight">Just a day here and there?</h2>
          <p className="mt-1 text-sm text-ink-secondary text-balance">
            A day pass opens every race on one race day, any day you choose. No subscription, and they never expire.
          </p>

          <div role="radiogroup" aria-label="How many passes" className="mt-4 grid grid-cols-4 gap-2">
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
                  className={`rounded-md border px-1 py-2 text-center transition-colors ${on ? "border-ink bg-ink text-white" : "border-line bg-panel hover:border-ink-soft"}`}
                >
                  <span className="block font-display text-lg font-extrabold leading-none tabular-nums">{x.qty}</span>
                  <span className={`block text-[11px] ${on ? "text-white/70" : "text-ink-soft"}`}>{x.qty === 1 ? "pass" : "passes"}</span>
                  <span className={`mt-1 block text-[11px] font-bold ${off > 0 ? (on ? "text-lime" : "text-accent") : "invisible"}`}>Save {off}%</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="md:w-64 md:border-l md:border-line md:pl-5">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-4xl font-extrabold tracking-tight tabular-nums">${b.price}</span>
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
