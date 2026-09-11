import { RacePanel } from "overlay";
import { otherRace, plays, race } from "./_data";
import { Frame } from "./_frame";

/** Top four as tabs, first pick open, with two plays on the race. */
export const TopFourWithPlays = () => (
  <Frame>
    <RacePanel race={race} plays={plays} />
  </Frame>
);

/** No plays yet: the plays tab counts zero. */
export const NoPlays = () => (
  <Frame>
    <RacePanel race={otherRace} plays={[]} />
  </Frame>
);

/** A race the model will not rank falls straight through to the plays tab. */
export const NoPicks = () => (
  <Frame>
    <RacePanel race={{ ...race, runners: race.runners.map((r) => ({ ...r, rank: null })) }} plays={plays} />
  </Frame>
);
