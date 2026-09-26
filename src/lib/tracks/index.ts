// Written by scripts/track-index.py: every track map with a usable post, keyed by name squashed to letters.
import type { Track } from "@/components/TrackMap";

import caulfield from "./caulfield.json";
import flemington from "./flemington.json";

export const TRACKS: Record<string, Track> = {
  caulfield: caulfield as Track,
  flemington: flemington as Track,
};
