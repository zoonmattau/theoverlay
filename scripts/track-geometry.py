"""Builds a track's outline file from OpenStreetMap for the race header's track map.

    python scripts/track-geometry.py flemington <osm-json>

Each track needs a few hand-checked facts in TRACKS below: which OSM way is the
course proper (the running rail), which is the outer rail with its chutes, the
direction of racing, where the winning post is, and each chute as a list of
outer-rail point indices (its tip first, its mouth last). Everything else, the
start for any distance, comes from the geometry. Map data (c) OpenStreetMap
contributors, ODbL.
"""
import json
import math
import sys

TRACKS = {
    "flemington": {
        "loop": 38347042,  # the course proper, 2,312m
        "outer": 38347043,  # outer rail, with the straight six and the chutes
        "clockwise": False,
        # The straight six ends at the post: the post is 1,200m back along the straight from its far end.
        "post": {"straightFrom": [6, 7], "metres": 1200},
        "chutes": [
            {"name": "straight", "tip": [6, 7], "mouth": [1, 12], "straight": True},
            {"name": "home turn chute", "tip": [70, 71], "mouth": [64, 76]},
            {"name": "back chute", "tip": [45, 46], "mouth": [40, 50]},
        ],
    },
    "caulfield": {
        "loop": 29252161,  # the course proper, 2,068m in OSM against 2,080m published
        "outer": 28678585,  # outer rail, with the three chutes
        "clockwise": False,
        # No straight course. From the club's diagram (Racing Australia racebook): the home
        # straight is the north side, run west, post near its end; the sprint chute is the long
        # straight gate off the east side, the 1400m chute the short one at the back, and the
        # 2000m start on the course just past the post. The post is set by the 1400m chute;
        # the sprint gate's tip then measures 1,259m (the 1200m stalls sit ~60m in from it),
        # the notch 1,727m (the 1700m start), and the straight ~340m to the published 367m.
        "post": {"fit": [1400], "chutes": ["1400m chute"]},
        "chutes": [
            {"name": "sprint chute", "tip": [113, 115], "mouth": [102, 124]},
            {"name": "1400m chute", "tip": [27, 29], "mouth": [24, 39]},
            {"name": "1700m chute", "tip": [49], "mouth": [48, 50]},
        ],
    },
}


def local(points, lat0):
    k = math.cos(math.radians(lat0))
    return [((p["lon"]) * 111320 * k, -(p["lat"]) * 111320) for p in points]


def seglen(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def mid(pts, idx):
    xs = [pts[i][0] for i in idx]
    ys = [pts[i][1] for i in idx]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def project(loop, p):
    """Nearest point on the loop to p, as (distance along the loop from its first point, point)."""
    best = (1e18, 0.0, p)
    along = 0.0
    for a, b in zip(loop, loop[1:]):
        L = seglen(a, b)
        if L == 0:
            continue
        t = max(0.0, min(1.0, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L)))
        q = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
        d = seglen(p, q)
        if d < best[0]:
            best = (d, along + t * L, q)
        along += L
    return best[1], best[2]


def ray_hit(p, d, poly):
    """Distance along direction d from p to the first crossing of the polyline, or None."""
    best = None
    for a, b in zip(poly, poly[1:]):
        ex, ey = b[0] - a[0], b[1] - a[1]
        den = d[0] * ey - d[1] * ex
        if abs(den) < 1e-9:
            continue
        t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den
        u = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den
        if t > 1 and 0 <= u <= 1 and (best is None or t < best):
            best = t
    return best


def centre_line(inner, outer):
    """The middle of the track: each inner-rail point moved out, square to the rail, half the way to the outer rail."""
    cx = sum(x for x, _ in inner) / len(inner)
    cy = sum(y for _, y in inner) / len(inner)
    pts = inner[:-1] if inner[0] == inner[-1] else inner
    n = len(pts)
    normals, widths = [], []
    for i, p in enumerate(pts):
        a, b = pts[i - 1], pts[(i + 1) % n]
        tx, ty = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, ty) or 1
        nx, ny = -ty / L, tx / L
        # Outward: away from the middle of the course.
        if (p[0] - cx) * nx + (p[1] - cy) * ny < 0:
            nx, ny = -nx, -ny
        normals.append((nx, ny))
        widths.append(ray_hit(p, (nx, ny), outer))
    known = sorted(w for w in widths if w is not None and w < 80)
    median = known[len(known) // 2] if known else 25
    # One width all the way round: the outer rail widens where a chute or the straight
    # course joins, and following it put a jog in the line.
    out = [(p[0] + nx * median / 2, p[1] + ny * median / 2) for p, (nx, ny) in zip(pts, normals)]
    return out + [out[0]]


def resample(pts, n):
    """n points evenly spaced along a polyline."""
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + seglen(a, b))
    out = []
    for k in range(n):
        d = cum[-1] * k / (n - 1)
        for i in range(len(pts) - 1):
            if cum[i] <= d <= cum[i + 1]:
                f = (d - cum[i]) / ((cum[i + 1] - cum[i]) or 1)
                out.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f))
                break
        else:
            out.append(pts[-1])
    return out


def run_indices(a, b):
    step = 1 if b >= a else -1
    return list(range(a, b + step, step))


def chute_line(outer, c, loop, along, total, rail_along):
    """The chute's middle from its tip to its mouth, then a curve easing into the course's middle."""
    tip, mouth = c["tip"], c["mouth"]
    wall_a = [outer[i] for i in run_indices(tip[0], mouth[0])]
    wall_b = [outer[i] for i in run_indices(tip[-1], mouth[1])]
    n = 24
    a, b = resample(wall_a, n), resample(wall_b, n)
    middle = [((p[0] + q[0]) / 2, (p[1] + q[1]) / 2) for p, q in zip(a, b)]
    m = middle[-1]
    ux, uy = m[0] - middle[-4][0], m[1] - middle[-4][1]
    un = math.hypot(ux, uy) or 1
    ux, uy = ux / un, uy / un
    # Join the course a little further on than where the mouth sits beside it, so the run eases in.
    a0, q = rail_along(m)
    gap = seglen(m, q)
    ease = max(40.0, min(120.0, gap * 3 + 30))
    join_along = (a0 + ease) % total
    j = point_at(loop, along, join_along)
    j2 = point_at(loop, along, (join_along + 5) % total)
    tx, ty = j2[0] - j[0], j2[1] - j[1]
    tn = math.hypot(tx, ty) or 1
    tx, ty = tx / tn, ty / tn
    c1 = (m[0] + ux * ease / 2, m[1] + uy * ease / 2)
    c2 = (j[0] - tx * ease / 2, j[1] - ty * ease / 2)
    curve = []
    for k in range(1, 13):
        t = k / 12
        x = (1 - t) ** 3 * m[0] + 3 * (1 - t) ** 2 * t * c1[0] + 3 * (1 - t) * t * t * c2[0] + t ** 3 * j[0]
        y = (1 - t) ** 3 * m[1] + 3 * (1 - t) ** 2 * t * c1[1] + 3 * (1 - t) * t * t * c2[1] + t ** 3 * j[1]
        curve.append((x, y))
    return middle + curve, join_along


def point_at(loop, along, a):
    """The centre-line point at official distance a round the course."""
    for i in range(len(loop) - 1):
        if along[i] <= a <= along[i + 1]:
            f = (a - along[i]) / ((along[i + 1] - along[i]) or 1)
            return (loop[i][0] + (loop[i + 1][0] - loop[i][0]) * f, loop[i][1] + (loop[i + 1][1] - loop[i][1]) * f)
    return loop[0]


def meet(loop, p0, p1):
    """Where the line from p0 through p1, carried on past p1, first crosses the loop."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    best = None
    for a, b in zip(loop, loop[1:]):
        ex, ey = b[0] - a[0], b[1] - a[1]
        den = dx * ey - dy * ex
        if abs(den) < 1e-9:
            continue
        t = ((a[0] - p0[0]) * ey - (a[1] - p0[1]) * ex) / den
        u = ((a[0] - p0[0]) * dy - (a[1] - p0[1]) * dx) / den
        if t > 0.5 and 0 <= u <= 1 and (best is None or t < best):
            best = t
    return (p0[0] + dx * best, p0[1] + dy * best) if best is not None else None


def main():
    name, src = sys.argv[1], sys.argv[2]
    cfg = TRACKS[name]
    data = json.load(open(src, encoding="utf-8"))
    ways = {e["id"]: e for e in data["elements"] if e.get("type", "way") == "way" or "geometry" in e}
    lat0 = ways[cfg["loop"]]["geometry"][0]["lat"]
    loop = local(ways[cfg["loop"]]["geometry"], lat0)
    outer = local(ways[cfg["outer"]]["geometry"], lat0)
    # Run the loop in the direction of racing: signed area < 0 is clockwise on screen (y down).
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(loop, loop[1:])) / 2
    on_screen_clockwise = area > 0
    if on_screen_clockwise != cfg["clockwise"]:
        loop = loop[::-1]
    # The line they run on: the middle of the track, halfway from the inner rail to the
    # outer. Drawing it on the inner rail left the blue off-centre in the outline and
    # sent chutes across the track to reach it (Flemington's 1400m, 26 Sep 2026).
    inner = loop
    loop = centre_line(inner, outer)
    # Distances are the official ones, along the rail: each centre-line point sits square
    # off an inner-rail point, and carries that point's distance round the rail.
    rail = inner[:-1] if inner[0] == inner[-1] else inner
    rail = rail + [rail[0]]
    along = [0.0]
    for a, b in zip(rail, rail[1:]):
        along.append(along[-1] + seglen(a, b))
    total = along[-1]

    def rail_along(p):
        """The official distance round the course of the centre-line point nearest p."""
        best = (1e18, 0.0, p)
        for i, (a, b) in enumerate(zip(loop, loop[1:])):
            L = seglen(a, b)
            if L == 0:
                continue
            t = max(0.0, min(1.0, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L)))
            q = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
            d = seglen(p, q)
            if d < best[0]:
                best = (d, along[i] + t * (along[i + 1] - along[i]), q)
        return best[1], best[2]

    s = cfg["post"]
    if "straightFrom" in s:
        # The post: along the straight course from its far end.
        far = mid(outer, s["straightFrom"])
        straight = next(c for c in cfg["chutes"] if c.get("straight"))
        mouth = mid(outer, straight["mouth"])
        ux, uy = mouth[0] - far[0], mouth[1] - far[1]
        n = math.hypot(ux, uy)
        guess = (far[0] + ux / n * s["metres"], far[1] + uy / n * s["metres"])
        post_along, post = rail_along(guess)
    else:
        # The post where the chutes best match their published starts, in whatever order.
        import itertools
        joins = []
        for c in [c for c in cfg["chutes"] if c["name"] in s.get("chutes", [c["name"] for c in cfg["chutes"]])]:
            tip, mo = mid(outer, c["tip"]), mid(outer, c["mouth"])
            hit = meet(loop, tip, mo)
            ja, jp = rail_along(hit) if hit else rail_along(mo)
            joins.append((ja, seglen(tip, jp)))
        best = None
        for a in range(0, int(total)):
            starts = [length + (a - ja) % total for ja, length in joins]
            for perm in itertools.permutations(s["fit"]):
                err = sum(abs(x - y) for x, y in zip(starts, perm))
                if best is None or err < best[0]:
                    best = (err, a, perm, starts)
        print("post fit: error %.0fm, chutes as %s, measured %s" % (best[0], best[2], [round(x) for x in best[3]]))
        post_along = float(best[1])
        post = point_at(loop, along, post_along)

    chutes = []
    for c in cfg["chutes"]:
        tip = mid(outer, c["tip"])
        mo = mid(outer, c["mouth"])
        if c.get("straight"):
            join_along, join = post_along, post
            line = [tip, post]
        else:
            # Down the middle of the chute, its two walls averaged, then eased into the middle
            # of the course a little further on, the way they run. A straight line from the tip
            # to wherever it met the course sat off-centre in the chute and hit the course at a
            # corner (Caulfield's 1200m and 1400m, 26 Sep 2026).
            line, join_along = chute_line(outer, c, loop, along, total, rail_along)
        length = sum(seglen(a, b) for a, b in zip(line, line[1:]))
        # Metres from the join to the post, running the way the horses do.
        to_post = (post_along - join_along) % total if not c.get("straight") else 0.0
        chutes.append({"name": c["name"], "line": line, "joinAlong": join_along, "length": length, "startDistance": length + to_post, "straight": bool(c.get("straight"))})

    # Shift everything so the drawing starts at 0,0.
    xs = [x for x, _ in outer + inner]
    ys = [y for _, y in outer + inner]
    ox, oy = min(xs), min(ys)
    sh = lambda pts: [[round(x - ox, 1), round(y - oy, 1)] for x, y in pts]
    out = {
        "name": name,
        "clockwise": cfg["clockwise"],
        "width": round(max(xs) - ox, 1),
        "height": round(max(ys) - oy, 1),
        "outer": sh(outer),
        "inner": sh(inner),
        "loop": sh(loop),
        "loopAlong": [round(a, 1) for a in along],
        "loopLength": round(total, 1),
        "postAlong": round(post_along, 1),
        "post": sh([post])[0],
        "chutes": [{**c, "line": sh(c["line"]), "joinAlong": round(c["joinAlong"], 1), "length": round(c["length"], 1), "startDistance": round(c["startDistance"])} for c in chutes],
        "attribution": "Map data (c) OpenStreetMap contributors",
    }
    path = f"src/lib/tracks/{name}.json"
    json.dump(out, open(path, "w", encoding="utf-8"))
    print(path, "loop", round(total), "m; chutes:", [(c["name"], round(c["startDistance"])) for c in chutes])


if __name__ == "__main__":
    main()
