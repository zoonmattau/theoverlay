"use client";

import { useState } from "react";

/** A read-only link with a copy button, for the invite page. */
export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked, the text is selectable anyway
    }
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <input readOnly value={link} className="field-input flex-1 min-w-[220px] nums" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn btn-primary" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
