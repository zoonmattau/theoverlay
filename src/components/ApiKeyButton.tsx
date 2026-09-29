"use client";

import { useState, useTransition } from "react";

import { CopyLink } from "@/components/CopyLink";

/** Makes a new API key and shows it once, with a copy button. */
export function ApiKeyButton({ make, live }: { make: () => Promise<string | undefined>; live: boolean }) {
  const [key, setKey] = useState<string>();
  const [pending, start] = useTransition();
  if (key) {
    return (
      <div className="w-full">
        <CopyLink link={key} label="Copy key" />
        <p className="mt-2 text-xs text-ink-soft">Copy it now. It is shown once and we only keep a scrambled copy.</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      disabled={pending}
      onClick={() => {
        if (live && !confirm("A new key switches the old one off. Carry on?")) return;
        start(async () => setKey(await make()));
      }}
    >
      {pending ? "Making…" : live ? "New key" : "Make a key"}
    </button>
  );
}
