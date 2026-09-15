"use client";

import { useEffect, useState, useTransition } from "react";

/**
 * A button that runs a server action and says how it went: the label swaps
 * while it runs, and the action's message shows as a toast for a few
 * seconds when it is done.
 */
export function ActionButton({
  action,
  children,
  busy,
  className = "btn btn-secondary btn-sm",
}: {
  action: () => Promise<string>;
  children: React.ReactNode;
  /** The label while it runs. */
  busy: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              setToast(await action());
            } catch (err) {
              setToast(err instanceof Error ? err.message : "Something went wrong.");
            }
          })
        }
      >
        {pending ? busy : children}
      </button>
      {toast && (
        <div className="toast" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </>
  );
}
