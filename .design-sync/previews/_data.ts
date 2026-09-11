// Sample data for the preview cards, produced by the app's own pipeline: the
// deterministic fixture card run through publishMeeting, exactly what the
// pages render in local development. Nothing here is hand-typed, so the
// previews track the model as it changes.
import { fixtureMeetings } from "@/lib/formking/fixtures";
import { publishMeeting, selectBestBets } from "@/lib/model/publish";
import type { Play, PublishedMeeting, PublishedRace, Selection } from "@/lib/model/types";

export const DATE = "2026-09-12";

export const meetings: PublishedMeeting[] = fixtureMeetings(DATE).map(({ meeting, races, speedmaps }) =>
  publishMeeting(meeting, races, speedmaps),
);

export const selections: Selection[] = selectBestBets(meetings);

/** A race with a full top four and at least one signal, for the richest cards. */
export const race: PublishedRace =
  meetings
    .flatMap((m) => m.races)
    .find((r) => r.runners.filter((x) => x.rank).length === 4 && r.runners.some((x) => x.signal)) ??
  meetings[0].races[0];

/** A race with a scratching, for the scratched footer. */
export const raceWithScratching: PublishedRace =
  meetings.flatMap((m) => m.races).find((r) => r.runners.some((x) => x.scratched)) ?? race;

/** A second field from another track, for stories that need contrast. */
export const otherRace: PublishedRace =
  meetings
    .flatMap((m) => m.races)
    .find((r) => r.meetingId !== race.meetingId && !r.runners.some((x) => x.scratched)) ??
  meetings[1].races[0];

const top = race.runners.find((r) => r.rank === 1)!;
const lay =
  race.runners.find((r) => r.signal === "lay") ??
  race.runners
    .filter((r) => !r.scratched && r.marketPrice && (r.edge ?? 0) < 0)
    .sort((a, b) => (a.marketPrice ?? 0) - (b.marketPrice ?? 0))[0];

export const plays: Play[] = [
  {
    id: `${DATE}-${race.raceId}-${top.tabNumber}`,
    date: DATE,
    meetingId: race.meetingId,
    raceId: race.raceId,
    tabNumber: top.tabNumber,
    horseName: top.horseName,
    side: "back",
    price: top.marketPrice ?? top.ratedPrice,
    stake: 1,
    status: "open",
    source: "model",
    tag: "top_overlay",
  },
  {
    id: `${DATE}-${race.raceId}-${lay.tabNumber}`,
    date: DATE,
    meetingId: race.meetingId,
    raceId: race.raceId,
    tabNumber: lay.tabNumber,
    horseName: lay.horseName,
    side: "lay",
    price: lay.marketPrice ?? lay.ratedPrice,
    stake: 0.5,
    status: "open",
    source: "manual",
    note: "Short for what it has done",
  },
];
