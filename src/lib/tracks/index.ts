// Written by scripts/track-index.py: every track map with a usable post, keyed by name squashed to letters.
import type { Track } from "@/components/TrackMap";

import caulfield from "./caulfield.json";
import darwin from "./darwin.json";
import eaglefarm from "./eaglefarm.json";
import flemington from "./flemington.json";
import goldcoast from "./goldcoast.json";
import gunbower from "./gunbower.json";
import kalgoorlie from "./kalgoorlie.json";
import murraybridge from "./murraybridge.json";
import murtoa from "./murtoa.json";
import newcastle from "./newcastle.json";
import northam from "./northam.json";
import randwick from "./randwick.json";
import toowoomba from "./toowoomba.json";
import waggariverside from "./waggariverside.json";

export const TRACKS: Record<string, Track> = {
  caulfield: caulfield as Track,
  darwin: darwin as Track,
  eaglefarm: eaglefarm as Track,
  flemington: flemington as Track,
  goldcoast: goldcoast as Track,
  gunbower: gunbower as Track,
  kalgoorlie: kalgoorlie as Track,
  murraybridge: murraybridge as Track,
  murtoa: murtoa as Track,
  newcastle: newcastle as Track,
  northam: northam as Track,
  randwick: randwick as Track,
  toowoomba: toowoomba as Track,
  waggariverside: waggariverside as Track,
};
