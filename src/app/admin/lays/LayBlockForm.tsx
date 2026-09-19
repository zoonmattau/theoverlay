"use client";

import { useState, useTransition } from "react";

/** Rules a horse out of the lays by name, with a line on why for the record. */
export function LayBlockForm({ block }: { block: (name: string, path?: string, reason?: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="field">
        <span>Horse</span>
        <input className="field-input w-56" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dawn Dancer" />
      </label>
      <label className="field flex-1 min-w-[200px]">
        <span>Why, for the record</span>
        <input className="field-input w-full" maxLength={140} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wins too often for what it rates." />
      </label>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending || !name.trim()}
        onClick={() =>
          start(async () => {
            await block(name.trim(), "/admin/lays", reason);
            setName("");
            setReason("");
          })
        }
      >
        {pending ? "Ruling out…" : "Rule out"}
      </button>
    </div>
  );
}

/** Lets a horse back into the lays; the next build decides on its own. */
export function LayUnblockButton({ horseKey, horse, unblock }: { horseKey: string; horse: string; unblock: (key: string, path?: string) => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-sm btn-secondary"
      disabled={pending}
      title={`Let ${horse} back into the lays`}
      onClick={() => start(() => unblock(horseKey, "/admin/lays"))}
    >
      {pending ? "…" : "Let back in"}
    </button>
  );
}
