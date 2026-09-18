
import { NtgCountdown } from "./Countdown";
import { jumpTime } from "@/lib/format";
import { now as clock } from "@/lib/admin";
import { raceTip, type PublishedMeeting, type RaceTip, type Selection } from "@/lib/model/types";

export type NtgTip = RaceTip;

/**
 * The next races across every track, soonest first, coloured by what we have
 * on: lime for the Prime Overlay, blue for a back, red for a lay.
 */
export function NextToGo({
  meetings,
  selections,
  date,
  tipsters,
}: {
  meetings: PublishedMeeting[];
  selections: Selection[];
  date: string;
  /** The tipsters the viewer follows, each with the races they have called, for the badge the board carries. */
  tipsters?: { name: string; raceIds: string[] }[];
}) {
  const initialsFor = (raceId: string) => (tipsters ?? []).filter((t) => t.raceIds.includes(raceId)).map((t) => t.name.trim()[0]?.toUpperCase() ?? "?");
  const prime = new Map(
    selections.filter((s) => s.tag === "prime_overlay" || s.tag === "top_overlay").map((s) => [s.raceId, s]),
  );
  // Run races drop off once the result is in, or ten minutes after the jump
  // if the result is slow, and the strip goes away with the last of them.
  const cutoff = clock() - 10 * 60_000;
  const races = meetings
    .flatMap((m) => m.races.map((r) => ({ m, r })))
    .filter((x) => x.r.jumpTime && !x.r.result && new Date(x.r.jumpTime).getTime() > cutoff)
    .sort((a, b) => a.r.jumpTime!.localeCompare(b.r.jumpTime!));

  if (races.length === 0) return null;

  return (
    <div className="ntg">
      <span className="ntg-label">Next to go</span>
      {races.map(({ m, r }) => {
        const backs = r.runners.filter((x) => x.signal === "back").length;
        const lays = r.runners.filter((x) => x.signal === "lay").length;
        const tip = raceTip(r.runners, prime.has(r.raceId));
        const tag =
          tip === "prime"
            ? "Prime Overlay"
            : tip === "roughie"
              ? backs === 1 ? "Way Overlay" : `${backs} Way Overlays`
              : tip === "back"
                ? `${backs} bet${backs === 1 ? "" : "s"}`
                : tip === "lay"
                  ? `${lays} lay${lays === 1 ? "" : "s"}`
                  : undefined;
        return (
          <NtgCountdown
            key={r.raceId}
            href={`/racing/${date}/${m.meetingId}/${r.raceId}`}
            iso={r.jumpTime}
            clock={jumpTime(r.jumpTime)}
            label={`${m.track} R${r.raceNumber}`}
            tip={tip}
            tag={tag}
            tipsters={initialsFor(r.raceId)}
          />
        );
      })}
    </div>
  );
}


