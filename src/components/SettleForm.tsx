"use client";

import { useActionState } from "react";

import { settleRace, type SettleState } from "@/app/racing/[date]/[meetingId]/[raceId]/settle";

const PLACES = [
  { name: "first", label: "1st" },
  { name: "second", label: "2nd" },
  { name: "third", label: "3rd" },
  { name: "fourth", label: "4th" },
] as const;

/** Admin only: the first four home by saddlecloth number, for a race that has jumped and has no result yet. */
export function SettleForm({ date, meetingId, raceId, runners }: { date: string; meetingId: string; raceId: string; runners: { tab: number; name: string }[] }) {
  const [state, action, pending] = useActionState(settleRace, {} as SettleState);
  if (state.done) {
    return (
      <p className="card border-lime bg-lime-soft py-3 text-sm font-semibold">
        {state.done} <span className="font-normal text-ink-secondary">The official result replaces it when Form King has it.</span>
      </p>
    );
  }
  return (
    <form action={action} className="card py-3 flex flex-wrap items-center gap-x-5 gap-y-3">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="raceId" value={raceId} />
      <div className="min-w-0">
        <div className="font-display font-extrabold leading-tight">Settle by hand</div>
        <div className="text-xs text-ink-soft">The first four home, in order. Only the winner is needed.</div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {PLACES.map((p, i) => (
          <label key={p.name} className="flex items-center gap-2 text-sm">
            <span className="w-7 text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft">{p.label}</span>
            <select name={p.name} required={i === 0} defaultValue="" className="h-9 w-44 rounded-md border border-line bg-bg px-2 text-sm">
              <option value="">{i === 0 ? "Winner" : "Not needed"}</option>
              {runners.map((r) => (
                <option key={r.tab} value={r.tab}>
                  {r.tab}. {r.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "Settling" : "Settle race"}
      </button>
      {state.error && <p className="basis-full text-sm text-red font-semibold">{state.error}</p>}
    </form>
  );
}
