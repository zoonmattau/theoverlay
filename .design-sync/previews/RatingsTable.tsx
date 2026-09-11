import { RatingsTable } from "overlay";
import { otherRace, race } from "./_data";
import { Frame } from "./_frame";

/** Every runner's categories against par, ranked on today's number. */
export const Ranked = () => (
  <Frame>
    <RatingsTable race={race} />
  </Frame>
);

/** The tempo and going columns follow the race: slow tempo, soft track. */
export const SlowAndSoft = () => (
  <Frame>
    <RatingsTable race={{ ...otherRace, going: "soft", pace: { tempo: "slow", pressure: 0.3 } }} />
  </Frame>
);
