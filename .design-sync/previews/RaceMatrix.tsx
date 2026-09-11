import { RaceMatrix } from "overlay";
import { DATE, meetings } from "./_data";
import { Frame } from "./_frame";

/** The day: three tracks, eight races each. */
export const ThreeMeetings = () => (
  <Frame>
    <RaceMatrix meetings={meetings} date={DATE} />
  </Frame>
);

/** A shorter program leaves empty cells at the end of its row. */
export const UnevenPrograms = () => (
  <Frame>
    <RaceMatrix meetings={[meetings[0], { ...meetings[1], races: meetings[1].races.slice(0, 3) }]} date={DATE} />
  </Frame>
);
