"use client";

import { useOptimistic, useState, useTransition } from "react";

import { react } from "@/app/tipsters/reactions";

const REACTIONS = [
  { key: "fire", emoji: "🔥", label: "On fire" },
  { key: "nod", emoji: "👍", label: "With you" },
  { key: "target", emoji: "🎯", label: "Nailed it" },
  { key: "eyes", emoji: "👀", label: "Watching" },
] as const;
type Key = (typeof REACTIONS)[number]["key"];

interface State {
  counts: Record<Key, number>;
  mine: Key[];
}

/** Four reactions under a tipster's call: tap to add, tap again to take back. Signed out, they only count. */
export function ReactionBar({ tipId, counts, mine, signedIn }: { tipId: number; counts: Record<Key, number>; mine: Key[]; signedIn: boolean }) {
  const [state, setState] = useState<State>({ counts, mine });
  const [shown, show] = useOptimistic(state, (s: State, key: Key) => {
    const on = s.mine.includes(key);
    return { counts: { ...s.counts, [key]: Math.max(0, s.counts[key] + (on ? -1 : 1)) }, mine: on ? s.mine.filter((k) => k !== key) : [...s.mine, key] };
  });
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string>();
  const tap = (key: Key) => {
    if (!signedIn) {
      setNote("Log in to react.");
      return;
    }
    start(async () => {
      show(key);
      const r = await react(tipId, key);
      if ("error" in r) {
        setNote(r.error);
        return;
      }
      setState((s) => {
        const on = s.mine.includes(key);
        if (on === r.on) return s;
        return { counts: { ...s.counts, [key]: Math.max(0, s.counts[key] + (r.on ? 1 : -1)) }, mine: r.on ? [...s.mine, key] : s.mine.filter((k) => k !== key) };
      });
    });
  };
  return (
    <span className="basis-full flex items-center gap-1.5 pt-1">
      {REACTIONS.map((r) => {
        const on = shown.mine.includes(r.key);
        const n = shown.counts[r.key];
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => tap(r.key)}
            disabled={pending}
            title={r.label}
            aria-pressed={on}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-none transition ${on ? "border-lime bg-lime-soft" : "border-line bg-transparent hover:border-line-strong"} ${n === 0 && !on ? "text-ink-soft" : ""}`}
          >
            <span aria-hidden="true">{r.emoji}</span>
            {n > 0 && <span className="nums">{n}</span>}
          </button>
        );
      })}
      {note && <span className="text-xs text-ink-soft ml-1">{note}</span>}
    </span>
  );
}
