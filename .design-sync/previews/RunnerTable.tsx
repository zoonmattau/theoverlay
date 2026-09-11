import { RunnerTable } from "overlay";
import { otherRace, race } from "./_data";
import { Frame } from "./_frame";

/** A full field: top four ranked, one back signal, one scratching in the footer. */
export const FullField = () => (
  <Frame>
    <RunnerTable race={race} />
  </Frame>
);

/** A field from another track: whatever the model found there, no scratchings. */
export const AnotherField = () => (
  <Frame>
    <RunnerTable race={otherRace} />
  </Frame>
);
