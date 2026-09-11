import { RaceConfidence } from "overlay";
import { meetings, race } from "./_data";
import { Frame } from "./_frame";

const track = meetings.find((m) => m.meetingId === race.meetingId)?.track ?? race.meetingId;

/** One badge per confidence band, driven off race.confidence. */
export const Bands = () => (
  <Frame>
    <div className="flex items-center gap-2">
      <RaceConfidence race={{ ...race, confidence: 0.77 }} />
      <RaceConfidence race={{ ...race, confidence: 0.45 }} />
      <RaceConfidence race={{ ...race, confidence: 0.2 }} />
    </div>
  </Frame>
);

/** Where it lives: beside the race title in the page header. */
export const InHeader = () => (
  <Frame>
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">
        {track} <span className="text-ink-secondary">R{race.raceNumber}</span>
      </h1>
      <RaceConfidence race={race} />
    </div>
  </Frame>
);
