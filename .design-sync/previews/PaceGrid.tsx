import { PaceGrid } from "overlay";
import { otherRace, race } from "./_data";
import { Frame } from "./_frame";

/** Runners in their expected settling position, tempo call in the head. */
export const EvenTempo = () => (
  <Frame>
    <PaceGrid race={{ ...race, pace: { tempo: "even", pressure: 0.55 } }} />
  </Frame>
);

/** A hot early pace: the tempo badge goes amber. */
export const FastTempo = () => (
  <Frame>
    <PaceGrid race={{ ...otherRace, pace: { tempo: "fast", pressure: 0.91 } }} />
  </Frame>
);

/** No speed in the race: the badge goes quiet. */
export const SlowTempo = () => (
  <Frame>
    <PaceGrid race={{ ...race, pace: { tempo: "slow", pressure: 0.2 } }} />
  </Frame>
);
