import { RankChip } from "overlay";
import { Frame } from "./_frame";

/** The top four in order. Only the first pick takes the lime. */
export const TopFour = () => (
  <Frame>
    <div className="flex items-center gap-2">
      <RankChip rank={1} />
      <RankChip rank={2} />
      <RankChip rank={3} />
      <RankChip rank={4} />
    </div>
  </Frame>
);

/** Beside a runner name, the way the field and ratings tables use it. */
export const BesideRunner = () => (
  <Frame>
    <div className="flex items-center gap-2 text-sm">
      <RankChip rank={1} />
      <span className="nums text-ink-soft">2</span>
      <span className="font-medium">Tempo Change</span>
    </div>
  </Frame>
);
