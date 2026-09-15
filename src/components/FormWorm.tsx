"use client";

import { useState } from "react";

import { price } from "@/lib/format";
import type { PublishedRace, PublishedRun, PublishedRunner } from "@/lib/model/types";

const W = 640, H = 170, PAD = { t: 10, r: 14, b: 22, l: 34 };

interface Hover {
  x: number;
  y: number;
  runner: PublishedRunner;
  /** The run under the pointer, or none for today's dot. */
  run?: PublishedRun;
}

const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
/** "4.5 above par" or "2.0 below par", from the points and today's par. */
const vsPar = (v: number, par: number) => {
  const gap = v - par;
  if (Math.abs(gap) < 0.05) return "at par";
  return `${Math.abs(gap).toFixed(1)} ${gap > 0 ? "above" : "below"} par`;
};
const day = (iso: string) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });

/**
 * The race as a worm: every runner's last runs as a line of points, most
 * recent on the right, then today's rating as the projected run in the last
 * slot. This runner is drawn heavy over the field in grey, with today's par
 * as a dashed line so a run above it reads as above class. Hover any point
 * for the horse and the run.
 */
export function FormWorm({ race, runner }: { race: PublishedRace; runner?: PublishedRunner }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const field = race.runners.filter((x) => !x.scratched && (x.runs?.length ?? 0) > 0);
  // One slot per past run, plus one on the right for today.
  const n = Math.max(2, ...field.map((x) => (x.runs?.length ?? 0) + 1));
  const pts = field.flatMap((x) => [...(x.runs ?? []).map((r) => r.points), x.ratings.today]);
  if (pts.length === 0) return null;
  const par = race.classPoints;
  const lo = Math.floor(Math.min(par - 6, ...pts) / 5) * 5;
  const hi = Math.ceil(Math.max(par + 6, ...pts) / 5) * 5;
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  // Slot i from the right: today sits in the rightmost slot, the last run next to it.
  const x = (back: number) => PAD.l + plotW - (back * plotW) / (n - 1);
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * plotH;
  const series = (f: PublishedRunner) => [f.ratings.today, ...(f.runs ?? []).map((r) => r.points)];
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += 5) ticks.push(v);
  const tone = runner ? (runner.prime ? "is-prime" : runner.signal === "back" ? "is-back" : runner.signal === "lay" ? "is-lay" : "") : "";
  const toneOf = (f: PublishedRunner) => (f.prime ? "is-prime" : f.signal === "back" ? "is-back" : f.signal === "lay" ? "is-lay" : "");
  const dots = (f: PublishedRunner, cls: string, r: number) => (
    <>
      {(f.runs ?? []).map((run, i) => (
        <circle
          key={`${run.date}-${i}`}
          cx={x(i + 1)}
          cy={y(run.points)}
          r={r}
          className={cls}
          onMouseEnter={() => setHover({ x: x(i + 1), y: y(run.points), runner: f, run })}
          onMouseLeave={() => setHover(null)}
        />
      ))}
      <circle
        cx={x(0)}
        cy={y(f.ratings.today)}
        r={r + 1}
        className={cls}
        onMouseEnter={() => setHover({ x: x(0), y: y(f.ratings.today), runner: f })}
        onMouseLeave={() => setHover(null)}
      />
    </>
  );

  return (
    <figure className="worm">
      <div className="worm-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={runner ? `${runner.horseName} against the field, run by run` : "The field, run by run"}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="worm-grid" />
              <text x={PAD.l - 6} y={y(v) + 3} className="worm-tick" textAnchor="end">{v}</text>
            </g>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(par)} y2={y(par)} className="worm-par" />
          <text x={W - PAD.r} y={y(par) - 4} className="worm-tick" textAnchor="end">par {par}</text>
          <line x1={x(0.5)} x2={x(0.5)} y1={PAD.t} y2={H - PAD.b} className="worm-today" />
          {field.filter((f) => f.tabNumber !== runner?.tabNumber).map((f) => (
            <g key={f.tabNumber} className={`worm-runner ${hover?.runner.tabNumber === f.tabNumber ? "is-hover" : ""} ${!runner && f.signal ? `is-called ${toneOf(f)}` : ""}`}>
              <path d={path(series(f))} className="worm-other" />
              {dots(f, "worm-dot-other", 3)}
            </g>
          ))}
          {runner && <path d={path(series(runner))} className={`worm-mine ${tone}`} />}
          {runner && dots(runner, `worm-dot ${tone}`, 4)}
          {Array.from({ length: n }, (_, back) => (
            <text key={back} x={x(back)} y={H - 6} className={`worm-tick ${back === 0 ? "worm-tick-today" : ""}`} textAnchor="middle">{back === 0 ? "today" : back === 1 ? "last" : `${back} back`}</text>
          ))}
        </svg>
        {hover && (
          <div
            className={`worm-tip ${hover.x > W * 0.6 ? "is-left" : ""}`}
            style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}
            role="tooltip"
          >
            <div className="worm-tip-name">{hover.runner.tabNumber}. {hover.runner.horseName}</div>
            {hover.run ? (
              <dl className="worm-tip-grid">
                <dt>When</dt><dd>{day(hover.run.date)}</dd>
                <dt>Track</dt><dd>{hover.run.track ?? "—"}</dd>
                <dt>Distance</dt><dd>{hover.run.distance}m</dd>
                {hover.run.going ? <><dt>Going</dt><dd>{hover.run.going}</dd></> : null}
                {hover.run.className ? <><dt>Class</dt><dd>{hover.run.className}</dd></> : null}
                <dt>Result</dt><dd>{hover.run.finish ? `${ord(hover.run.finish)}${hover.run.runners ? ` of ${hover.run.runners}` : ""}` : "unplaced"}{hover.run.margin !== undefined && hover.run.finish !== 1 ? `, ${hover.run.margin.toFixed(1)}L` : ""}</dd>
                {hover.run.sp ? <><dt>SP</dt><dd>{price(hover.run.sp)}</dd></> : null}
                <dt>Points</dt><dd className="worm-tip-pts">{hover.run.points.toFixed(1)}<span>, {vsPar(hover.run.points, par)}</span></dd>
              </dl>
            ) : (
              <dl className="worm-tip-grid">
                <dt>Today</dt><dd className="worm-tip-pts">{hover.runner.ratings.today.toFixed(1)}<span>, {vsPar(hover.runner.ratings.today, par)}</span></dd>
                <dt>Rated</dt><dd>{price(hover.runner.ratedPrice)}</dd>
                {hover.runner.marketPrice ? <><dt>Market</dt><dd>{price(hover.runner.marketPrice)}</dd></> : null}
              </dl>
            )}
          </div>
        )}
      </div>
      <figcaption className="worm-caption">
        {runner ? (
          <>
            <span className="worm-key worm-key-mine" /> {runner.horseName}
            <span className="worm-key worm-key-other ml-3" /> the field
          </>
        ) : (
          <>
            <span className="worm-key worm-key-other" /> the field, calls in colour
          </>
        )}
        <span className="worm-key worm-key-par ml-3" /> today&apos;s par
        <span className="ml-3">the last dot is today&apos;s rating</span>
      </figcaption>
    </figure>
  );
}
