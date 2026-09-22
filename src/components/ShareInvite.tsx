"use client";

import { useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * The invite link with the ways to send it: copy, the phone's share sheet
 * where there is one, and WhatsApp, a text or an email with the message
 * already written.
 */
export function ShareInvite({ link, message }: { link: string; message: string }) {
  const [copied, setCopied] = useState(false);
  // The share sheet exists on phones; the server renders without it.
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
  const text = `${message} ${link}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked, the text is selectable anyway
    }
  }
  async function share() {
    try {
      await navigator.share({ title: "The Overlay", text: message, url: link });
    } catch {
      // closed the sheet
    }
  }
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        <input readOnly value={link} className="field-input flex-1 min-w-[220px] nums" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-primary" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canShare && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={share}>
            Share
          </button>
        )}
        <a className="btn btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">WhatsApp</a>
        <a className="btn btn-secondary btn-sm" href={`sms:?&body=${encodeURIComponent(text)}`}>Text</a>
        <a className="btn btn-secondary btn-sm" href={`mailto:?subject=${encodeURIComponent("Two weeks of The Overlay")}&body=${encodeURIComponent(text)}`}>Email</a>
      </div>
      <p className="mt-3 text-xs text-ink-soft">The message they get: &ldquo;{message}&rdquo;</p>
    </>
  );
}
