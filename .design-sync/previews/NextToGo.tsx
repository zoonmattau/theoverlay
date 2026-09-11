import { NextToGo } from "overlay";
import { DATE, meetings } from "./_data";
import { Frame } from "./_frame";

// Fixture jump times are fixed to the card's date; shift them onto today's
// clock so the strip shows live countdowns instead of tomorrow's times.
const now = Date.now();
const live = meetings.map((m, mi) => ({
  ...m,
  races: m.races.map((r, i) => ({
    ...r,
    jumpTime: new Date(now + (12 + i * 32 + mi * 11) * 60_000).toISOString(),
  })),
}));

/** The strip across the top of the day page: soonest race first. */
export const Strip = () => (
  <Frame style={{ padding: "16px 24px" }}>
    <NextToGo meetings={live} date={DATE} />
  </Frame>
);

/** One track only. */
export const SingleTrack = () => (
  <Frame style={{ padding: "16px 24px" }}>
    <NextToGo meetings={[live[0]]} date={DATE} />
  </Frame>
);
