"use client";

import { useActionState } from "react";

import { settleRace, type SettleState } from "@/app/racing/[date]/[meetingId]/[raceId]/settle";

/** Admin only: the first four home by saddlecloth number, for a race that has jumped and has no result yet. */
export function SettleForm({ date, meetingId, raceId, runners }: { date: string; meetingId: string; raceId: string; runners: { tab: number; name: string }[] }) {
  const [state, action, pending] = useActionState(settleRace, {} as SettleState);
  if (state.done) return <p className="border border-lime bg-lime-soft px-3 py-2 text-xs rounded-md font-semibold">{state.done} The official result replaces it when Form King has it.</p>;
  return (
    <form action={action} className="border border-line bg-panel px-3 py-2 rounded-md text-xs flex flex-wrap items-end gap-2">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="raceId" value={raceId} />
      <span className="font-semibold mr-1">Settle by hand:</span>
      {(["first", "second", "third", "fourth"] as const).map((k, i) => (
        <label key={k} className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-ink-soft">{["1st", "2nd", "3rd", "4th"][i]}</span>
          <select name={k} required={i === 0} defaultValue="" className="border border-line rounded px-1.5 py-1 bg-bg text-xs">
            <option value="">{i === 0 ? "pick" : "—"}</option>
            {runners.map((r) => (
              <option key={r.tab} value={r.tab}>{r.tab}. {r.name}</option>
            ))}
          </select>
        </label>
      ))}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Settling" : "Settle"}</button>
      {state.error && <span className="text-red font-semibold basis-full">{state.error}</span>}
    </form>
  );
}
