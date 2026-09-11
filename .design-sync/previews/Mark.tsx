import { Mark } from "overlay";
import { Frame } from "./_frame";

/** The mark at topbar size, in the accent it normally wears. */
export const Accent = () => (
  <Frame>
    <div className="topbar-brand">
      <Mark className="mark" />
    </div>
  </Frame>
);

/** It draws with currentColor, so it takes whatever colour its parent has. */
export const Sizes = () => (
  <Frame>
    <div className="flex items-end gap-6">
      <Mark className="w-4 h-4 text-ink-soft" />
      <Mark className="w-6 h-6 text-ink" />
      <Mark className="w-10 h-10 text-accent" />
      <Mark className="w-16 h-16 text-accent" />
    </div>
  </Frame>
);
