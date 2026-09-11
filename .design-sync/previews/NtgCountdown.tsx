import { NtgCountdown } from "overlay";
import { Frame } from "./_frame";

// Jump times relative to now so each state is stable whenever the card renders.
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

/** A race some way off: track, top pick, countdown in lime. */
export const Upcoming = () => (
  <Frame>
    <NtgCountdown href="#" iso={minutesFromNow(48)} clock="1:35 pm" label="Randwick R3" top="9 Iron Ledger" />
  </Frame>
);

/** Inside fifteen minutes the countdown turns amber. */
export const Imminent = () => (
  <Frame>
    <NtgCountdown href="#" iso={minutesFromNow(6)} clock="12:53 pm" label="Flemington R1" top="11 Final Furlong" />
  </Frame>
);

/** No pick yet: just the track and the clock. */
export const NoPick = () => (
  <Frame>
    <NtgCountdown href="#" iso={minutesFromNow(200)} clock="4:07 pm" label="Eagle Farm R6" />
  </Frame>
);
