import { Points } from "overlay";
import { Frame } from "./_frame";

/** Against a par of 66: lime three or more above, dim three or more below, quiet in between. */
export const AgainstPar = () => (
  <Frame>
    <div className="flex items-center gap-6 text-sm">
      <Points value={70.4} par={66} />
      <Points value={67.2} par={66} />
      <Points value={59.5} par={66} />
    </div>
  </Frame>
);

/** Strong weight for the number a row is ranked on. */
export const Strong = () => (
  <Frame>
    <div className="flex items-center gap-6 text-sm">
      <Points value={70.4} par={66} strong />
      <Points value={64.1} par={66} strong />
      <Points value={57.5} par={66} strong />
    </div>
  </Frame>
);
