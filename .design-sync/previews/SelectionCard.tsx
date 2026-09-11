import { SelectionCard } from "overlay";
import { DATE, selections } from "./_data";
import { Frame } from "./_frame";

const byTag = (tag: string) => selections.find((s) => s.tag === tag) ?? selections[0];

/** The headline pick carries the accent border and badge. */
export const OverlayOfTheDay = () => (
  <Frame width={360}>
    <SelectionCard s={byTag("top_overlay")} date={DATE} />
  </Frame>
);

/** The other two tags stay on the muted badge. */
export const PrimeOverlay = () => (
  <Frame width={360}>
    <SelectionCard s={byTag("prime_overlay")} date={DATE} />
  </Frame>
);

export const LongOverlay = () => (
  <Frame width={360}>
    <SelectionCard s={byTag("long_overlay")} date={DATE} />
  </Frame>
);

/** The three together, as the home page lays them out. */
export const DaysSelections = () => (
  <Frame>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {selections.map((s) => (
        <SelectionCard key={s.tag} s={s} date={DATE} />
      ))}
    </div>
  </Frame>
);
