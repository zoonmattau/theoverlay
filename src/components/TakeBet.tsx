"use client";

import { useState, useTransition } from "react";

import { takeBet, untakeBet } from "@/app/tips/actions";

/**
 * "I took this": a tick with the price and stake you got. Saved per member,
 * so the Tips page can show your own units next to ours.
 */
export function TakeBet({
  date,
  raceId,
  tab,
  side,
  live,
  taken,
}: {
  date: string;
  raceId: string;
  tab: number;
  side: "back" | "lay";
  live?: number;
  taken?: { price: number | null; stake: number };
}) {
  const [pending, start] = useTransition();
  const [price, setPrice] = useState(taken?.price ?? live ?? 0);
  const [stake, setStake] = useState(taken?.stake ?? 1);

  if (!taken) {
    return (
      <button
        type="button"
        className="btn btn-secondary btn-sm whitespace-nowrap"
        disabled={pending}
        onClick={() => start(() => takeBet({ date, raceId, tab, side, price: live, stake: 1 }))}
      >
        I took it
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-1 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        start(() => takeBet({ date, raceId, tab, side, price, stake }));
      }}
    >
      <span className="text-ink-soft">@</span>
      <input
        type="number"
        step="0.05"
        min="1.01"
        value={price || ""}
        onChange={(e) => setPrice(Number(e.target.value))}
        onBlur={() => start(() => takeBet({ date, raceId, tab, side, price, stake }))}
        className="field-input w-16 py-1 px-1.5 text-xs nums"
        aria-label="Price you got"
      />
      <span className="text-ink-soft">×</span>
      <input
        type="number"
        step="0.5"
        min="0.5"
        value={stake}
        onChange={(e) => setStake(Number(e.target.value))}
        onBlur={() => start(() => takeBet({ date, raceId, tab, side, price, stake }))}
        className="field-input w-12 py-1 px-1.5 text-xs nums"
        aria-label="Units staked"
      />
      <button type="submit" className="sr-only">Save</button>
      <button type="button" className="text-ink-soft hover:text-red ml-1" title="Remove" disabled={pending} onClick={() => start(() => untakeBet({ raceId, tab }))}>
        ×
      </button>
    </form>
  );
}
