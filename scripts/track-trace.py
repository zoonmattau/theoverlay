"""Traces a course's rails from a green turf mask over aerial imagery into an OSM-shaped file track-atlas.py can read,
for a course OpenStreetMap does not have (Murray Bridge, at Gifford Hill).

    python scripts/track-trace.py <mask.npy> <tiles.json> <out osm json> <name>

mask.npy is the course's turf as a boolean image (the largest green blob, chutes and all) over Esri World
Imagery tiles at zoom z, starting at tile x0, y0 (tiles.json). The hole in the middle is the inner rail, the
blob's edge the outer rail with its chutes. Add the track to _index.json with osm "way/3" (the venue box).
"""
import json, math, sys
import numpy as np
from scipy import ndimage as nd

def moore(mask):
    """The outer boundary of a binary blob, in order, by Moore-neighbour tracing with Jacob's stop."""
    m = np.pad(mask, 1)
    ys, xs = np.nonzero(m)
    i = np.lexsort((xs, ys))[0]
    p = (int(ys[i]), int(xs[i]))
    nb = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]  # clockwise from north
    back = (p[0], p[1] - 1)
    start = (p, back)
    out = [p]
    for _ in range(400000):
        idx = nb.index((back[0] - p[0], back[1] - p[1]))
        for k in range(1, 9):
            c = (p[0] + nb[(idx + k) % 8][0], p[1] + nb[(idx + k) % 8][1])
            if m[c]:
                prev = nb[(idx + k - 1) % 8]
                back = (p[0] + prev[0], p[1] + prev[1])
                p = c
                break
        if (p, back) == start:
            break
        out.append(p)
    return [(x - 1, y - 1) for y, x in out]


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0], float), np.array(pts[-1], float)
    ab = b - a
    L = np.hypot(*ab) or 1
    d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / L for p in pts]
    i = int(np.argmax(d))
    if d[i] > eps:
        return rdp(pts[: i + 1], eps)[:-1] + rdp(pts[i:], eps)
    return [pts[0], pts[-1]]

lab = np.load(sys.argv[1])
meta = json.load(open(sys.argv[2]))
out_path, name = sys.argv[3], sys.argv[4]
z, x0, y0 = meta["z"], meta["x0"], meta["y0"]
filled = nd.binary_fill_holes(lab)
holes, n = nd.label(filled & ~lab)
sizes = nd.sum(np.ones_like(holes), holes, range(1, n + 1))
hole = holes == (int(np.argmax(sizes)) + 1)

def to_ll(px, py):
    nt = 2 ** z
    x, y = x0 + px / 256, y0 + py / 256
    return {"lat": math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / nt)))), "lon": x / nt * 360 - 180}

def ring(mask, smooth):
    b = moore(mask)
    # A closed ring: simplify each half, split at the point farthest from the start.
    # Pixel stairs out: a moving average round the ring over about 8m, then simplified.
    arr = np.array(b, float)
    w = smooth
    if w > 1:
        k = np.ones(w) / w
        arr = np.stack([np.convolve(np.concatenate([arr[-w:, j], arr[:, j], arr[:w, j]]), k, mode="same")[w:-w] for j in (0, 1)], 1)
    b = [tuple(p) for p in arr]
    k = max(range(len(b)), key=lambda i: (b[i][0] - b[0][0]) ** 2 + (b[i][1] - b[0][1]) ** 2)
    b = rdp(b[: k + 1], 0.8)[:-1] + rdp(b[k:] + [b[0]], 0.8)[:-1]
    return [to_ll(x + 0.5, y + 0.5) for x, y in b]

inner, outer = ring(hole, 31), ring(filled, 5)
inner.append(inner[0]); outer.append(outer[0])
lats = [p["lat"] for p in outer]; lons = [p["lon"] for p in outer]
pad = 0.002
venue = [{"lat": min(lats) - pad, "lon": min(lons) - pad}, {"lat": min(lats) - pad, "lon": max(lons) + pad}, {"lat": max(lats) + pad, "lon": max(lons) + pad}, {"lat": max(lats) + pad, "lon": min(lons) - pad}]
venue.append(venue[0])
json.dump({"elements": [
    {"type": "way", "id": 1, "tags": {}, "geometry": inner},
    {"type": "way", "id": 2, "tags": {}, "geometry": outer},
    {"type": "way", "id": 3, "tags": {"sport": "horse_racing", "name": name, "source": "traced from Esri World Imagery"}, "geometry": venue},
]}, open(out_path, "w"))
print(len(inner), "inner points,", len(outer), "outer points")
