import { Stat } from "overlay";
import { Frame } from "./_frame";

/** The race header row: label over value, tabular figures. */
export const RaceHeader = () => (
  <Frame>
    <div className="grid grid-cols-4 gap-2">
      <Stat label="Distance" value="1400m" />
      <Stat label="Class" value="BM72" />
      <Stat label="Going" value="Good 4" />
      <Stat label="Field" value={11} />
    </div>
  </Frame>
);

/** Tone is a text colour class: accent for an edge, secondary for context. */
export const Toned = () => (
  <Frame>
    <div className="grid grid-cols-4 gap-2">
      <Stat label="Rated" value="$3.66" tone="text-ink" />
      <Stat label="Market" value="$3.62" tone="text-ink-secondary" />
      <Stat label="Edge" value="+12.4%" tone="text-accent" />
      <Stat label="Win" value="27%" tone="text-ink-secondary" />
    </div>
  </Frame>
);
