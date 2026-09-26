"""Writes src/lib/tracks/index.ts: every track map, keyed by the track name squashed to letters.

    python scripts/track-index.py

Run after track-geometry.py or track-atlas.py. An automatic map is left out
until it has been reviewed, so a track shows no map rather than a wrong one.
"""
import json
import os

DIR = "src/lib/tracks"
# A second course at the same venue is not the main course's map.
SKIP = {"caulfieldheath", "morphettvilleparks", "illawarragrange"}

entries = []
for f in sorted(os.listdir(DIR)):
    if not f.endswith(".json"):
        continue
    slug = f[:-5]
    if slug in SKIP:
        continue
    data = json.load(open(os.path.join(DIR, f), encoding="utf-8"))
    # An automatic map goes live only once reviewed (auto.reviewed set by hand after a look).
    if data.get("auto") and not data["auto"].get("reviewed"):
        continue
    entries.append(slug)

lines = ["// Written by scripts/track-index.py: every track map with a usable post, keyed by name squashed to letters.", 'import type { Track } from "@/components/TrackMap";', ""]
for s in entries:
    lines.append(f'import {s} from "./{s}.json";')
lines.append("")
lines.append("export const TRACKS: Record<string, Track> = {")
for s in entries:
    lines.append(f"  {s}: {s} as Track,")
lines.append("};")
open(os.path.join(DIR, "index.ts"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print(len(entries), "track maps in the index")
