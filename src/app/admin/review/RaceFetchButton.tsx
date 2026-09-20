"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { fetchReview } from "./actions";

/**
 * Buys one race's runs on their own: the ones still missing, or, once
 * they are all in, the ones without a full benchmark again, for a race
 * the review needs before the rest of the day is refetched.
 */
export function RaceFetchButton({ date, raceId, missing, partial }: { date: string; raceId: string; missing: number; partial: number }) {
  const router = useRouter();
  const [state, setState] = useState<{ running: boolean; note?: string }>({ running: false });
  const refresh = missing === 0;
  const n = refresh ? partial : missing;
  if (n === 0) return null;

  async function run() {
    setState({ running: true });
    try {
      const p = await fetchReview(date, refresh, "all", raceId);
      setState({ running: false, note: `${p.fetched} runs for ${p.credits} credits.` });
      router.refresh();
    } catch (err) {
      setState({ running: false, note: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <button type="button" className="btn btn-secondary btn-sm" disabled={state.running} onClick={run}>
        {state.running ? "Fetching" : refresh ? `Refetch ${n} without full benchmarks, ${n * 2} credits` : `Fetch ${n} runs, ${n * 2} credits`}
      </button>
      {state.note && <span className="text-ink-soft">{state.note}</span>}
    </span>
  );
}
