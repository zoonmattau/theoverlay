"use client";

import { useActionState } from "react";

import { fetchResult, settleRace, type SettleState } from "@/app/racing/[date]/[meetingId]/[raceId]/settle";

const PLACES = [
  { name: "first", label: "1st" },
  { name: "second", label: "2nd" },
  { name: "third", label: "3rd" },
  { name: "fourth", label: "4th" },
] as const;

/** Admin only: the first four home by saddlecloth number, for a race that has jumped and has no result yet. */
export function SettleForm({ date, meetingId, raceId, runners, current = [] }: { date: string; meetingId: string; raceId: string; runners: { tab: number; name: string }[]; current?: number[] }) {
  const [state, action, pending] = useActionState(settleRace, {} as SettleState);
  const [fstate, fetchAction, fetching] = useActionState(fetchResult, {} as SettleState);
  const settled = current.length > 0;
  if (fstate.done) return <p className="card border-lime bg-lime-soft py-2 text-sm font-semibold">{fstate.done}</p>;
  return (
    <form action={action} className="card py-2">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="raceId" value={raceId} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 items-center lg:grid-cols-[auto_repeat(4,minmax(0,1fr))_auto]">
        <div className="col-span-2 lg:col-span-1 lg:pr-2 leading-tight">
          <span className="font-display font-extrabold text-sm">{settled ? "Settled by hand" : "Settle by hand"}</span>
          <span className="block text-[11px] text-ink-soft">{state.done ?? (settled ? "Change it or add a place." : "First four home, winner is enough.")}</span>
        </div>
        {PLACES.map((p, i) => (
          <label key={p.name} className="flex items-center gap-1.5 min-w-0">
            <span className="w-7 shrink-0 text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft">{p.label}</span>
            <select name={p.name} required={i === 0} defaultValue={current[i] ?? ""} className="h-8 w-full rounded-md border border-line bg-bg px-2 text-sm">
              <option value="">{i === 0 ? "Winner" : "Not needed"}</option>
              {runners.map((r) => (
                <option key={r.tab} value={r.tab}>
                  {r.tab}. {r.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="submit" className="btn btn-primary btn-sm h-8 col-span-2 lg:col-span-1" disabled={pending || fetching}>
          {pending ? "Saving" : settled ? "Update result" : "Settle race"}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-soft">
        <span>{settled ? "Official dividends, margins and starting prices come with the feed's result." : "Placings settle every call; dividends come with the feed's result."}</span>
        <button type="submit" formAction={fetchAction} formNoValidate className="underline hover:text-ink" disabled={pending || fetching}>
          {fetching ? "Asking Form King…" : "Check for it now (2 credits)"}
        </button>
        {fstate.error && <span className="text-red font-semibold">{fstate.error}</span>}
      </div>
      {state.error && <p className="mt-2 text-sm text-red font-semibold">{state.error}</p>}
    </form>
  );
}
