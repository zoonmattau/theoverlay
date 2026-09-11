import { Mark, Wordmark } from "overlay";
import { Frame } from "./_frame";

/** The wordmark on its own. */
export const Default = () => (
  <Frame>
    <Wordmark />
  </Frame>
);

/** Mark and wordmark together, as the topbar brand lockup. */
export const WithMark = () => (
  <Frame>
    <div className="topbar-brand">
      <Mark className="mark" />
      <Wordmark />
    </div>
  </Frame>
);
