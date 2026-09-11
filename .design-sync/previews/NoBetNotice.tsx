import { NoBetNotice } from "overlay";
import { Frame } from "./_frame";

/** Shown in place of the selection cards on a day nothing qualifies. */
export const Default = () => (
  <Frame>
    <NoBetNotice />
  </Frame>
);
