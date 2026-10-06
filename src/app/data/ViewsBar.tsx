"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteView, saveView } from "./actions";

type View = { id: string; name: string; path: string; query: string };

/**
 * Saved views as chips under the tabs, and Save view to keep the page as it
 * stands: the slicers and the table's filters, sort and columns all ride in
 * the address, so a view is just the page and its query.
 */
export function ViewsBar({ views }: { views: View[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, start] = useTransition();
  const here = `${path}${params.size ? `?${params}` : ""}`;

  const save = () =>
    start(async () => {
      // Read at the click: the table writes its state to the address without telling the router.
      const res = await saveView(name, window.location.pathname, window.location.search);
      if (!res.ok) return setError(res.error);
      setNaming(false);
      setName("");
      setError(undefined);
      router.refresh();
    });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold mr-1">My views</span>
      {views.length === 0 && !naming && <span className="text-ink-soft">Set up a table the way you like it, then save it here.</span>}
      {views.map((v) => {
        const href = `${v.path}${v.query}`;
        const on = href === here;
        return (
          <span key={v.id} className={`inline-flex items-center rounded-full border ${on ? "bg-ink text-bg border-ink" : "border-line hover:border-ink-soft"}`}>
            <Link href={href} className="pl-2.5 pr-1 py-0.5">{v.name}</Link>
            <button type="button" aria-label={`Delete ${v.name}`} className="px-1.5 py-0.5 opacity-60 hover:opacity-100" onClick={() => start(async () => { await deleteView(v.id); router.refresh(); })}>×</button>
          </span>
        );
      })}
      {naming ? (
        <form className="inline-flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view" aria-label="View name" maxLength={60} className="field-input h-7! min-h-0! py-0! text-xs w-44" />
          <button type="submit" disabled={busy || !name.trim()} className="btn btn-primary btn-sm">Save</button>
          <button type="button" className="text-ink-soft underline" onClick={() => { setNaming(false); setError(undefined); }}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="ml-1 rounded-full border border-dashed border-ink-soft px-2.5 py-0.5 hover:border-ink hover:bg-panel-alt" onClick={() => setNaming(true)}>+ Save view</button>
      )}
      {error && <span className="text-red">{error}</span>}
    </div>
  );
}
