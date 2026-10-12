"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";

import { redeemPass } from "@/lib/passes/actions";
import { latePassNow } from "@/lib/passes/late";

const noSubscribe = () => () => {};

/** Spends one day pass on the date shown, then reloads the page unlocked. From 4pm it opens tomorrow too. */
export function UsePassButton({ date, credits }: { date: string; credits: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  // Read the clock in the browser only, so the server render never disagrees with it.
  const late = useSyncExternalStore(
    noSubscribe,
    () => date === new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date()) && latePassNow(),
    () => false,
  );

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
            {late ? "Use a day pass for today and tomorrow" : "Use a day pass for today"}
            <span className="nums font-normal opacity-70">· {credits} left</span>
          </>
        )}
      </button>
      {failed && <span className="text-xs text-red font-semibold">No passes left.</span>}
    </div>
  );
}
