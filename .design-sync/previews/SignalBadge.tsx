import { SignalBadge } from "overlay";
import { Frame } from "./_frame";

/** Back is lime, lay is red. Nothing else on the page gets those colours. */
export const BackAndLay = () => (
  <Frame>
    <div className="flex items-center gap-2">
      <SignalBadge signal="back" />
      <SignalBadge signal="lay" />
    </div>
  </Frame>
);

/** Without a signal it renders nothing, so it can sit in every row unconditionally. */
export const NoSignal = () => (
  <Frame>
    <div className="flex items-center gap-2 text-sm">
      <span className="nums text-ink-soft">5</span>
      <span>Iron Ledger</span>
      <SignalBadge />
      <span className="text-xs text-muted">(no signal, so no badge)</span>
    </div>
  </Frame>
);
