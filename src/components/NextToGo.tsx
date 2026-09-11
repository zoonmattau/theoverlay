
import { NtgCountdown } from "./Countdown";
import { jumpTime } from "@/lib/format";
import type { PublishedMeeting, Selection } from "@/lib/model/types";

export type NtgTip = "prime" | "back" | "lay";

/**
 * The next races across every track, soonest first, coloured by what we have
 * on: lime for the Prime Overlay, blue for a back, red for a lay.
 */
export function NextToGo({
  meetings,
  selections,
  date,
}: {
  meetings: PublishedMeeting[];
  selections: Selection[];
  date: string;
}) {
  const prime = new Map(
    selections.filter((s) => s.tag === "prime_overlay" || s.tag === "top_overlay").map((s) => [s.raceId, s]),
  );
  const races = meetings
    .flatMap((m) => m.races.map((r) => ({ m, r })))
    .filter((x) => x.r.jumpTime && !x.r.result)
    .sort((a, b) => a.r.jumpTime!.localeCompare(b.r.jumpTime!));

  if (races.length === 0) return null;

  return (
    <div className="ntg">
      <span className="ntg-label">Next to go</span>
      {races.map(({ m, r }) => {
        const backs = r.runners.filter((x) => x.signal === "back").length;
        const lays = r.runners.filter((x) => x.signal === "lay").length;
        const tip: NtgTip | undefined = prime.has(r.raceId)
          ? "prime"
          : backs > 0
            ? "back"
            : lays > 0
              ? "lay"
              : undefined;
        const tag =
          tip === "prime"
            ? "Prime Overlay"
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
          />
        );
      })}
    </div>
  );
}


