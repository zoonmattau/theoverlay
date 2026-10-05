"use client";

import Link from "next/link";
import { useState } from "react";

import type { Person, Stage } from "@/lib/money";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The people behind a figure, over the page: name to their admin page, plan, and a sum if there is one. Esc, the cross or a click outside closes it. */
function List({ title, people, sum, onClose }: { title: string; people: Person[]; sum?: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div role="dialog" aria-label={title} className="card w-full max-w-lg max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-display font-extrabold">{title}</h2>
          <button type="button" autoFocus onClick={onClose} className="ml-auto text-ink-soft text-lg leading-none" aria-label="Close">×</button>
        </div>
        {people.length === 0 && <p className="text-sm text-ink-soft">Nobody.</p>}
        {people.map((p) => (
          <div key={p.id} className="panel-row text-sm">
            <span className="min-w-0">
              <Link href={`/admin/${p.id}`} className="font-semibold hover:text-blue block truncate">{p.who}</Link>
              <span className="text-xs text-ink-soft block truncate">{p.plan}</span>
            </span>
            {p.cents !== undefined && <span className="nums font-bold">{money(p.cents)}</span>}
          </div>
        ))}
        {sum && <p className="mt-3 text-xs text-ink-soft text-right">{sum}</p>}
      </div>
    </div>
  );
}

/** A figure tile that opens the list of people it counts. */
export function PeopleTile({ n, label, tone, title, people, sum }: { n: number | string; label: string; tone?: "prime" | "bet"; title: string; people: Person[]; sum?: string }) {
  const [open, setOpen] = useState(false);
  const cls = tone === "prime" ? "border-lime bg-lime-soft" : tone === "bet" ? "border-blue bg-blue-soft" : "";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`card text-center cursor-pointer hover:border-ink transition-colors ${cls}`}>
        <div className="font-display text-2xl font-extrabold tracking-tight nums">{n}</div>
        <div className="text-[10px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1 underline decoration-dotted underline-offset-2">{label}</div>
      </button>
      {open && <List title={title} people={people} sum={sum} onClose={() => setOpen(false)} />}
    </>
  );
}

// Left to right, red to green: how far each person got.
const PARTS: { stage: Stage; label: string; cls: string }[] = [
  { stage: "unconfirmed", label: "never confirmed their email", cls: "bg-red" },
  { stage: "confirmed", label: "confirmed, no plan", cls: "bg-amber" },
  { stage: "ended", label: "plan ended", cls: "bg-ink-soft" },
  { stage: "trial", label: "on a trial now", cls: "bg-blue" },
  { stage: "paying", label: "paying now", cls: "bg-lime" },
];

/**
 * The window's sign-ups as one bar, each person in the furthest place they got.
 * Each piece is its share of everyone; a click on a piece, or its line in the key, lists who is in it.
 */
export function Funnel({ people }: { people: (Person & { stage: Stage })[] }) {
  const [open, setOpen] = useState<Stage | null>(null);
  const made = people.length;
  if (made === 0) return <p className="text-sm text-ink-soft">No sign-ups in this window.</p>;
  const parts = PARTS.map((x) => ({ ...x, who: people.filter((p) => p.stage === x.stage) }));
  const pct = (n: number) => `${Math.round((n / made) * 100)}%`;
  const shown = parts.find((x) => x.stage === open);
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-display text-3xl font-extrabold nums">{made}</span>
        <span className="text-xs text-ink-soft">signed up</span>
      </div>
      <div className="flex h-8 w-full overflow-hidden rounded-md">
        {parts.filter((x) => x.who.length > 0).map((x) => (
          <button key={x.stage} type="button" onClick={() => setOpen(x.stage)} className={`${x.cls} h-full cursor-pointer hover:opacity-80 border-r-2 border-panel last:border-r-0`} style={{ width: `${(x.who.length / made) * 100}%` }} aria-label={`${x.who.length} ${x.label}`} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {parts.map((x) => (
          <li key={x.stage} className="min-w-0">
            <button type="button" onClick={() => setOpen(x.stage)} disabled={!x.who.length} className="flex w-full items-center gap-2 min-w-0 text-left enabled:hover:text-blue">
              <span className={`${x.cls} h-2.5 w-2.5 shrink-0 rounded-sm`} />
              <span className="nums font-semibold">{x.who.length}</span>
              <span className="text-ink-soft truncate">{x.label}</span>
              <span className="nums text-ink-soft ml-auto">{pct(x.who.length)}</span>
            </button>
          </li>
        ))}
      </ul>
      {shown && <List title={`${shown.who.length} ${shown.label}`} people={shown.who} onClose={() => setOpen(null)} />}
    </div>
  );
}
