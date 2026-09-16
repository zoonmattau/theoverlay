"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { publishSaturdayReview } from "./actions";

/** Publishes the public review for the date: the site page, the home banner for two days, and the Discord post the first time. */
export function PublishButton({ date, published }: { date: string; published?: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ running: boolean; note?: string }>({ running: false });
  async function run() {
    setState({ running: true });
    try {
      const r = await publishSaturdayReview(date);
      setState({ running: false, note: `${published ? "Updated" : "Published"}: ${r.storylines.length} storylines.` });
      router.refresh();
    } catch (err) {
      setState({ running: false, note: err instanceof Error ? err.message : String(err) });
    }
  }
  return (
    <span className="flex items-center gap-3">
      <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={state.running}>
        {state.running ? "Publishing…" : published ? "Republish the public review" : "Publish the public review"}
      </button>
      {state.note && <span className="text-sm text-ink-soft">{state.note}</span>}
      {!state.note && published && <span className="text-sm text-ink-soft">Live since {new Date(published).toLocaleString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}.</span>}
    </span>
  );
}
