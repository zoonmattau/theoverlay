import { NextTipTicker } from "./NextTipTicker";
import { getTodayCard, RELEASE_HOUR } from "@/lib/model/source";

/**
 * On the sign-up page: how many calls are on today's card and a countdown to
 * the next one jumping, so the page shows what is on offer right now.
 */
export async function SignupPitch({ dark }: { dark?: boolean }) {
  const { meetings, released } = await getTodayCard();
  const calls = meetings.flatMap((m) =>
    m.races.flatMap((r) => r.runners.filter((x) => x.signal && !x.scratched).map((x) => ({ track: m.track, raceNumber: r.raceNumber, jump: r.jumpTime, run: Boolean(r.result?.length), side: x.signal }))),
  );
  const now = Date.now();
  const next = calls
    .filter((c) => !c.run && c.jump && new Date(c.jump).getTime() > now)
    .sort((a, b) => (a.jump ?? "").localeCompare(b.jump ?? ""))[0];
  const bets = calls.filter((c) => c.side === "back").length;
  const lays = calls.length - bets;
  const soft = dark ? "text-bar-soft" : "text-ink-soft";
  const strong = dark ? "text-bar-ink" : "text-ink";
  return (
    <div className={`rounded-md border ${dark ? "border-white/15" : "border-line bg-panel-alt"} px-4 py-3 text-sm ${soft}`}>
      {!released ? (
        <p>Today&apos;s calls release at {RELEASE_HOUR}am. Sign up now and they are waiting for you.</p>
      ) : calls.length === 0 ? (
        <p>No calls on today&apos;s card. Tomorrow&apos;s goes up at {RELEASE_HOUR}am.</p>
      ) : (
        <>
          <p>
            <strong className={`font-display text-2xl font-extrabold tracking-tight nums ${strong}`}>{calls.length}</strong>{" "}
            {calls.length === 1 ? "tip" : "tips"} on today&apos;s card, {bets} {bets === 1 ? "bet" : "bets"} and {lays} {lays === 1 ? "lay" : "lays"}.
          </p>
          {next ? (
            <p className="mt-1">
              Next one jumps in <strong className={strong}><NextTipTicker iso={next.jump!} /></strong>, {next.track} R{next.raceNumber}.
            </p>
          ) : (
            <p className="mt-1">All of today&apos;s have run. Tomorrow&apos;s card goes up at {RELEASE_HOUR}am.</p>
          )}
        </>
      )}
    </div>
  );
}
