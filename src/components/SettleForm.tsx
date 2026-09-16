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
export function SettleForm({ date, meetingId, raceId, runners, current = [], dividends = {} }: { date: string; meetingId: string; raceId: string; runners: { tab: number; name: string }[]; current?: number[]; dividends?: { win?: number; place?: (number | undefined)[] } }) {
  const [state, action, pending] = useActionState(settleRace, {} as SettleState);
  const settled = current.length > 0;
  return (
    <form action={action} className="card py-2">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="raceId" value={raceId} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 items-center lg:grid-cols-[auto_repeat(4,minmax(0,1fr))_auto]">
        <div className="col-span-2 lg:col-span-1 lg:pr-2 leading-tight">
          <span className="font-display font-extrabold text-sm">{settled ? "Settled by hand" : "Settle by hand"}</span>
          <span className="block text-[11px] text-ink-soft">{state.done ?? (settled ? "Change it or add a place. The official result replaces it." : "First four home. The official result replaces it.")}</span>
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
        <button type="submit" className="btn btn-primary btn-sm h-8 col-span-2 lg:col-span-1" disabled={pending}>
          {pending ? "Saving" : settled ? "Update result" : "Settle race"}
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 items-center lg:grid-cols-[auto_repeat(4,minmax(0,1fr))_auto]">
        <span className="col-span-2 lg:col-span-1 text-[11px] text-ink-soft lg:pr-2">Dividends: win, then the places</span>
        {[
          { name: "win", label: "Win", value: dividends.win },
          { name: "place1", label: "1st", value: dividends.place?.[0] },
          { name: "place2", label: "2nd", value: dividends.place?.[1] },
          { name: "place3", label: "3rd", value: dividends.place?.[2] },
        ].map((d) => (
          <label key={d.name} className="flex items-center gap-1.5 min-w-0">
            <span className="w-7 shrink-0 text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft">{d.label}</span>
            <span className="relative w-full">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-soft">$</span>
              <input name={d.name} type="number" step="0.01" min="1.01" defaultValue={d.value ?? ""} placeholder="0.00" className="h-8 w-full rounded-md border border-line bg-bg pl-5 pr-2 text-sm nums" />
            </span>
          </label>
        ))}
      </div>
      {state.error && <p className="mt-2 text-sm text-red font-semibold">{state.error}</p>}
    </form>
  );
}
