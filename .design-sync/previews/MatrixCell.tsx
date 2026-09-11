import { MatrixCell } from "overlay";
import { Frame } from "./_frame";

// Jump times relative to now so each state is stable whenever the card renders.
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

/** Hours out, with the top pick named and a back signal in the race. */
export const Upcoming = () => (
  <Frame width={160}>
    <MatrixCell href="#" iso={minutesFromNow(180)} clock="2:45 pm" top="2 Tempo Change" backs={1} lays={0} />
  </Frame>
);

/** Inside fifteen minutes the cell turns amber. */
export const Imminent = () => (
  <Frame width={160}>
    <MatrixCell href="#" iso={minutesFromNow(9)} clock="12:09 pm" top="7 Ghost Gum" backs={1} lays={1} />
  </Frame>
);

/** Ten minutes after the jump the cell fades and reads Run. */
export const Jumped = () => (
  <Frame width={160}>
    <MatrixCell href="#" iso={minutesFromNow(-25)} clock="11:35 am" top="1 Glass House" backs={0} lays={0} />
  </Frame>
);

/** A lay-only race carries a red dot and border. */
export const LaySignal = () => (
  <Frame width={160}>
    <MatrixCell href="#" iso={minutesFromNow(95)} clock="1:35 pm" top="10 Marble Arch" backs={0} lays={1} />
  </Frame>
);

/** No pick yet: just the clock. */
export const NoPick = () => (
  <Frame width={160}>
    <MatrixCell href="#" iso={minutesFromNow(240)} clock="3:45 pm" backs={0} lays={0} />
  </Frame>
);
