import { RatingTiles } from "overlay";
import { race } from "./_data";
import { Frame } from "./_frame";

const top = race.runners.find((r) => r.rank === 1)!;
const outsider = race.runners
  .filter((r) => !r.rank && !r.scratched)
  .sort((a, b) => a.ratings.today - b.ratings.today)[0];

/** The top pick: most categories clear of par. */
export const TopPick = () => (
  <Frame>
    <RatingTiles r={top.ratings} par={race.classPoints} />
  </Frame>
);

/** An outsider: the same tiles, mostly dim. */
export const Outsider = () => (
  <Frame>
    <RatingTiles r={outsider.ratings} par={race.classPoints} />
  </Frame>
);
