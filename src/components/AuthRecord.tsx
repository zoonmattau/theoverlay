import Link from "next/link";
import { connection } from "next/server";

import { publicRecord } from "@/lib/tips";
import { racingToday } from "@/lib/model/source";

/** The record since launch in one line on the sign-up panel: units, calls, and the way to every result. */
export async function AuthRecord() {
  await connection();
  const all = (await publicRecord(racingToday())).find((r) => r.period === "all");
  const calls = all ? all.bets.n + all.lays.n : 0;
  if (!all || calls === 0) return null;
  const u = all.net;
  return (
    <Link href="/results" className="group block rounded-md border border-white/15 px-4 py-3 hover:border-lime/60">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-bar-soft">Since launch</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className={`font-display text-2xl font-extrabold tracking-tight tabular-nums ${u >= 0 ? "text-lime" : "text-bar-ink"}`}>
          {u >= 0 ? "+" : "−"}
          {Math.abs(u).toFixed(1)}u
        </span>
        <span className="text-sm text-bar-soft tabular-nums">from {calls.toLocaleString("en-AU")} calls, level stakes</span>
      </div>
      <div className="mt-1 text-xs font-semibold text-bar-soft group-hover:text-lime">Every result, won and lost →</div>
    </Link>
  );
}
