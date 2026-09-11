import { Badge } from "overlay";
import { Frame } from "./_frame";

/** Every tone side by side. Accent is reserved for the headline selection. */
export const Tones = () => (
  <Frame>
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="accent">Overlay of the Day</Badge>
      <Badge tone="muted">Prime Overlay</Badge>
      <Badge tone="ok">Strong read</Badge>
      <Badge tone="warn">Low confidence</Badge>
    </div>
  </Frame>
);

/** Default tone is muted, so an unqualified badge stays quiet. */
export const Default = () => (
  <Frame>
    <Badge>Long Overlay</Badge>
  </Frame>
);

/** Where a badge usually sits: the head of a card, opposite the race label. */
export const InCardHeader = () => (
  <Frame>
    <div className="card" style={{ width: 300 }}>
      <div className="flex items-center justify-between gap-3">
        <Badge tone="accent">Overlay of the Day</Badge>
        <span className="text-[11px] text-muted uppercase tracking-wider">Flemington R7</span>
      </div>
    </div>
  </Frame>
);
