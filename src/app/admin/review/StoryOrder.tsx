"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveStory } from "./actions";

/**
 * The races the story tells, in order, one id per line. Saved, the story
 * page opens in that order from then on; emptied, it goes back to the
 * default. The ids are the ones in the race page's address.
 */
export function StoryOrder({ date, races, saved }: { date: string; races: string[]; saved: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(races.join("\n"));
  const [state, setState] = useState<{ busy: boolean; note?: string }>({ busy: false });

  async function save(list: string[]) {
    setState({ busy: true });
    try {
      await saveStory(date, list);
      setState({ busy: false, note: list.length ? "Saved." : "Back to the default order." });
      router.push(`/admin/review/${date}/story`);
      router.refresh();
    } catch (err) {
      setState({ busy: false, note: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  return (
    <div className="text-sm">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide the order" : saved ? "Change the order" : "Set the order"}
      </button>
      {open && (
        <div className="card mt-3 space-y-2">
          <p className="text-ink-soft">One race id per line, in the order to tell them. The id is the last part of a race page&apos;s address, like CAUL_190926_5.</p>
          <textarea className="field-input w-full font-mono text-xs" rows={Math.max(6, text.split("\n").length + 1)} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={state.busy} onClick={() => save(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))}>
              Save this order
            </button>
            {saved && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={state.busy} onClick={() => save([])}>
                Back to the default
              </button>
            )}
            {state.note && <span className="text-ink-soft">{state.note}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
