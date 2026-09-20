"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { fetchReview } from "./actions";

/**
 * Buys the runs for every bet and lay still to buy across the days on
 * file, one day at a time, so the ledgers cover the whole week and not
 * just the Saturday someone opened.
 */
export function AllCallsButton({ dates, toBuy }: { dates: string[]; toBuy: number }) {
  const router = useRouter();
  const [state, setState] = useState<{ running: boolean; done: number; credits: number; day?: string; note?: string }>({ running: false, done: 0, credits: 0 });

  async function run() {
    setState({ running: true, done: 0, credits: 0 });
    let done = 0;
    let credits = 0;
    try {
      for (const date of dates) {
        setState((s) => ({ ...s, day: date }));
        for (;;) {
          const p = await fetchReview(date, false, "calls");
          done += p.fetched;
          credits += p.credits;
          setState((s) => ({ ...s, done, credits }));
          if (p.remaining === 0 || p.fetched === 0) break;
        }
      }
      router.refresh();
      setState({ running: false, done, credits, note: `Done, ${done} runs for ${credits} credits.` });
    } catch (err) {
      setState((s) => ({ ...s, running: false, note: err instanceof Error ? err.message : "Something went wrong." }));
    }
  }

  if (toBuy === 0 && !state.note) return <span className="text-sm text-ink-soft">Every bet and lay on file has its run.</span>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {toBuy > 0 && (
        <button type="button" className="btn btn-primary btn-sm" disabled={state.running} onClick={run}>
          {state.running ? `Fetching ${state.day ?? ""}, ${state.done} done` : `Fetch the ${toBuy} calls still to buy, ${toBuy * 2} credits`}
        </button>
      )}
      {state.note && <span className="text-ink-soft">{state.note}</span>}
    </div>
  );
}
