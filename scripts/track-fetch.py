"""Finds each of our tracks in OpenStreetMap and saves the lines around it.

    python scripts/track-fetch.py <tracks.json> <au_racecourses.json> <out dir>

tracks.json is [{track, state}], from the stored cards; au_racecourses.json is
every horse-racing feature in Australia from Overpass (out center tags). Each
match's surroundings go to <out dir>/<slug>.json for track-geometry to read.
Map data (c) OpenStreetMap contributors, ODbL.
"""
import json
import math
import os
import re
import subprocess
import sys
import time

# Rough state boxes (lat min, lat max, lon min, lon max), enough to split same-named towns.
STATES = {
    "NSW": (-37.6, -28.1, 140.9, 153.7), "ACT": (-35.95, -35.1, 148.7, 149.4), "VIC": (-39.2, -33.9, 140.9, 150.0),
    "QLD": (-29.2, -10.0, 137.9, 153.6), "SA": (-38.1, -25.9, 128.9, 141.1), "WA": (-35.2, -13.6, 112.9, 129.1),
    "TAS": (-43.7, -39.5, 143.8, 148.5), "NT": (-26.1, -10.9, 128.9, 138.1),
}
# Our names where the club or the map uses another.
ALIASES = {
    "Wagga": ["Wagga Wagga", "Murrumbidgee Turf Club"], "Canterbury": ["Canterbury Park"], "Randwick": ["Royal Randwick", "Randwick"],
    "Illawarra Grange": ["Kembla Grange"], "Caulfield Heath": ["Caulfield"], "Morphettville Parks": ["Morphettville"],
    "Sunshine Coast": ["Corbould Park", "Sunshine Coast"], "Gold Coast": ["Gold Coast Turf Club", "Aquis Park", "Gold Coast"],
    "Mt Magnet": ["Mount Magnet"], "Hawkesbury": ["Clarendon", "Hawkesbury"], "Newcastle": ["Broadmeadow", "Newcastle"],
    "Canberra": ["Thoroughbred Park", "Canberra"], "Belmont": ["Belmont Park"], "Launceston": ["Mowbray", "Launceston"],
    "Darwin": ["Fannie Bay", "Darwin"], "Kilmore": ["Kilmore"], "Cranbourne": ["Cranbourne"],
    "Alice Springs": ["Pioneer Park", "Alice Springs Turf"], "Toowoomba": ["Clifford Park", "Toowoomba Turf"], "Tuncurry": ["Great Lakes", "Tuncurry", "Forster"],
    "Mackay": ["Ooralea", "Mackay Turf"], "Griffith": ["Griffith"], "Dalby": ["Dalby"], "Sale": ["Greenwattle", "Sale Turf", "Sale Racecourse"],
    "Wellington": ["Wellington Racecourse", "Wellington Boot", "Wellington Racing"], "Bowen": ["Bowen"], "Ballarat": ["Dowling Forest", "Ballarat Turf"],
    "Townsville": ["Cluden", "Townsville Turf"], "Echuca": ["Echuca"], "Kalgoorlie": ["Kalgoorlie", "Boulder Racing"], "Narromine": ["Narromine"],
    "Murray Bridge": ["Gifford Hill", "Murray Bridge"], "Toodyay": ["Toodyay"],
}

slug = lambda s: re.sub(r"[^a-z]", "", s.lower())


def in_state(e, st):
    c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
    if c.get("lat") is None or st not in STATES:
        return True
    a, b, c1, d = STATES[st]
    return a <= c["lat"] <= b and c1 <= c["lon"] <= d


def score(e, names):
    t = e.get("tags", {})
    n = t.get("name", "").lower()
    if not n or not any(x.lower() in n for x in names):
        return -1
    s = 0
    if t.get("sport") == "horse_racing":
        s += 3
    if t.get("leisure") in ("sports_centre", "recreation_ground", "racetrack") or t.get("landuse") == "recreation_ground":
        s += 3
    if "racecourse" in n or "race course" in n or "turf club" in n or "racing club" in n or "jockey club" in n:
        s += 2
    if any(w in n for w in ("harness", "greyhound", "trotting", "pacing", "dog", "off road", "motor", "speedway", "kart", "bmx", "cycle")):
        s -= 10
    return s


def main():
    tracks = json.load(open(sys.argv[1], encoding="utf-8"))
    feats = json.load(open(sys.argv[2], encoding="utf-8"))["elements"]
    out = sys.argv[3]
    os.makedirs(out, exist_ok=True)
    found = {}
    for t in tracks:
        names = ALIASES.get(t["track"], []) + [t["track"]]
        cands = sorted(((score(e, names), e) for e in feats if in_state(e, t["state"])), key=lambda x: -x[0])
        cands = [c for c in cands if c[0] >= 2]
        if not cands:
            print("NO MATCH", t["track"], t["state"])
            continue
        e = cands[0][1]
        c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
        found[t["track"]] = {"state": t["state"], "osm": f"{e['type']}/{e['id']}", "name": e["tags"].get("name"), "lat": c["lat"], "lon": c["lon"]}
    json.dump(found, open(os.path.join(out, "_index.json"), "w", encoding="utf-8"), indent=1)
    print(len(found), "matched of", len(tracks))
    for track, f in found.items():
        path = os.path.join(out, slug(track) + ".json")
        if os.path.exists(path) and os.path.getsize(path) > 200:
            continue
        # Everything but roads and land-use areas within 900m: the rails, the chutes and the stands.
        q = f'[out:json][timeout:90];way(around:900,{f["lat"]},{f["lon"]})[!"highway"][!"landuse"];out geom tags;'
        for url in ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
            r = subprocess.run(["curl", "-s", "-m", "150", "-A", "theoverlay-trackmap/1.0 (hello@theoverlay.com.au)", "--data-urlencode", f"data={q}", url, "-o", path])
            ok = os.path.exists(path) and open(path, "rb").read(1) == b"{"
            if ok:
                break
            time.sleep(8)
        print(track, "ok" if ok else "FAILED", f["name"], flush=True)
        time.sleep(2)


if __name__ == "__main__":
    main()
