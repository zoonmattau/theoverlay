"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { fetchReview } from "./actions";

/**
 * Buys the runs for the review. A Saturday is a few hundred horses, more
 * than one server call can pace inside its time limit, so the button keeps
 * calling until nothing is left and shows the count as it goes.
 */
export function FetchButton({ date, missing, partial, callsMissing }: { date: string; missing: number; partial: number; callsMissing: number }) {
  const router = useRouter();
  const [state, setState] = useState<{ running: boolean; done: number; credits: number; note?: string }>({ running: false, done: 0, credits: 0 });

  async function run(refresh: boolean, scope: "all" | "calls" = "all") {
    setState({ running: true, done: 0, credits: 0 });
    let done = 0;
    let credits = 0;
    try {
      for (;;) {
        const p = await fetchReview(date, refresh, scope);
        done += p.fetched;
        credits += p.credits;
        setState({ running: true, done, credits, note: p.unknown ? `${p.unknown} runners have no horse id and were skipped.` : undefined });
        router.refresh();
        if (p.remaining === 0 || p.fetched === 0) break;
      }
      setState((s) => ({ ...s, running: false, note: `Done, ${done} runs for ${credits} credits.${s.note ? ` ${s.note}` : ""}` }));
    } catch (err) {
      setState((s) => ({ ...s, running: false, note: err instanceof Error ? err.message : "Something went wrong." }));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {callsMissing > 0 && (
        <button type="button" className="btn btn-primary btn-sm" disabled={state.running} onClick={() => run(false, "calls")}>
          {state.running ? `Fetching, ${state.done} done` : `Fetch the ${callsMissing} calls, ${callsMissing * 2} credits`}
        </button>
      )}
      {missing > 0 && (
        <button type="button" className={`btn ${callsMissing > 0 ? "btn-secondary" : "btn-primary"} btn-sm`} disabled={state.running} onClick={() => run(false)}>
          {state.running ? `Fetching, ${state.done} done` : `Fetch all ${missing} runs, ${missing * 2} credits`}
        </button>
      )}
      {missing === 0 && partial > 0 && (
        <button type="button" className="btn btn-secondary btn-sm" disabled={state.running} onClick={() => run(true)}>
          {state.running ? `Fetching, ${state.done} done` : `Refetch ${partial} without full benchmarks, ${partial * 2} credits`}
        </button>
      )}
      {state.note && <span className="text-ink-soft">{state.note}</span>}
    </div>
  );
}
