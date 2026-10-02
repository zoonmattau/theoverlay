"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { redeemPass } from "@/lib/passes/actions";

/** Spends one day pass on the date shown, then reloads the page unlocked. */
export function UsePassButton({ date, credits }: { date: string; credits: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn btn-primary gap-1.5"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const ok = await redeemPass(date);
            if (ok) router.refresh();
            else setFailed(true);
          })
        }
      >
        {pending ? "Opening" : (
          <>
            Use a day pass for today
            <span className="nums font-normal opacity-70">· {credits} left</span>
          </>
        )}
      </button>
      {failed && <span className="text-xs text-red font-semibold">No passes left.</span>}
    </div>
  );
}
