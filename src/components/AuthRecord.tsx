import Link from "next/link";
import { connection } from "next/server";

import { dailyUnits, publicRecord } from "@/lib/tips";
import { racingToday } from "@/lib/model/source";

/**
 * The record since launch on the sign-up panel: the units, the calls behind
 * them, and the running line day by day, linking to every result.
 */
export async function AuthRecord() {
  await connection();
  const [records, daily] = await Promise.all([publicRecord(racingToday()), dailyUnits()]);
  const all = records.find((r) => r.period === "all");
  const calls = all ? all.bets.n + all.lays.n : 0;
  if (!all || calls === 0) return null;
  const u = all.net;

  // The running total, drawn as a line: start at zero, one point a day.
  const pts = daily.reduce<number[]>((acc, d) => [...acc, acc[acc.length - 1] + d.units], [0]);
  const W = 300, H = 56, pad = 3;
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts);
  const x = (i: number) => pad + (i / Math.max(1, pts.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + ((hi - v) / Math.max(1e-9, hi - lo)) * (H - pad * 2);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${x(pts.length - 1).toFixed(1)},${y(lo).toFixed(1)}L${x(0).toFixed(1)},${y(lo).toFixed(1)}Z`;

  return (
    <Link href="/results" className="group block rounded-lg border border-white/12 bg-white/[0.03] p-4 transition-colors hover:border-lime/50">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-bar-soft">Since launch</span>
        <span className="text-[11px] text-bar-soft tabular-nums">{calls.toLocaleString("en-AU")} calls · level stakes</span>
      </div>
      <div className={`mt-1 font-display text-3xl font-extrabold tracking-tight tabular-nums ${u >= 0 ? "text-lime" : "text-bar-ink"}`}>
        {u >= 0 ? "+" : "−"}
        {Math.abs(u).toFixed(1)} units
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-14 w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="auth-rec" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#c6f24e" stopOpacity="0.28" />
            <stop offset="1" stopColor="#c6f24e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#auth-rec)" />
        <path d={line} fill="none" stroke="#c6f24e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 text-xs font-semibold text-bar-soft group-hover:text-lime">Every result, won and lost →</div>
    </Link>
  );
}
