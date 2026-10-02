"""Builds track maps for every downloaded track, finding the shapes on its own.

    python scripts/track-atlas.py <osm dir>

For each <osm dir>/<slug>.json (from track-fetch.py) it finds the course (the
inner rail ring), the outer rail and its chutes, runs the track the way its
state does, places the post, checks the chutes against standard starts, and
writes src/lib/tracks/<slug>.json with a confidence. Tracks set up by hand in
track-geometry.py (Flemington, Caulfield) are left alone. Map data (c)
OpenStreetMap contributors, ODbL.
"""
import importlib.util
import json
import math
import os
import sys

spec = importlib.util.spec_from_file_location("tg", os.path.join(os.path.dirname(__file__), "track-geometry.py"))
tg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tg)

# Posts placed by hand, in rail metres round the loop, where the stand or straight finder gets it wrong.
POST = {
    "doomben": 1675,  # on the straight just before the turn; the chute then comes out near the 1350
    "goldcoast": 1870,  # end of the long straight by the owners and trainers car park, not the Bundall Road offices
    "murtoa": 380,  # near the end of the straight; the chutes then come out at 1200 and 1600
    "toowoomba": 1485,  # about 400m before the stand finder's guess, placed by eye
    "waggariverside": 1300,  # just before the corner, where its chutes come out at 1100 and 1600
}
# Chute starts known from the club: each built chute takes the nearest.
CHUTE_STARTS = {"waggariverside": [1100, 1400, 1600], "randwick": [1200, 1400, 1600]}
# Where the ring round the course in OSM is a property fence, not the outer rail.
NO_OUTER = {"newcastle"}
ANTICLOCKWISE = {"VIC", "SA", "TAS", "NT", "WA"}
STARTS = [800, 900, 1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350, 1400, 1450, 1500, 1550, 1600, 1650, 1700, 1800, 1850, 1900, 2000, 2050, 2100, 2200, 2300, 2400, 2500]
SKIP_TAGS = ("building", "highway", "railway", "waterway", "power", "boundary", "admin_level", "amenity", "shop", "natural", "barrier_skip")
BAD_LANDUSE = ("residential", "retail", "commercial", "industrial", "farmland", "farmyard", "forest", "cemetery", "railway", "construction")


def length(pts):
    return sum(tg.seglen(a, b) for a, b in zip(pts, pts[1:]))


def area(pts):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:])) / 2)


def centroid(pts):
    return (sum(x for x, _ in pts) / len(pts), sum(y for _, y in pts) / len(pts))


def inside(p, poly):
    x, y = p
    c = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            c = not c
    return c


def near(p, poly):
    best = 1e18
    for a, b in zip(poly, poly[1:]):
        L = tg.seglen(a, b)
        if L == 0:
            continue
        t = max(0.0, min(1.0, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L)))
        best = min(best, math.hypot(p[0] - (a[0] + t * (b[0] - a[0])), p[1] - (a[1] + t * (b[1] - a[1]))))
    return best


def usable(t):
    if any(k in t for k in ("building", "railway", "waterway", "power", "boundary")):
        return False
    if t.get("highway") and t.get("highway") not in ("track", "raceway"):
        return False
    if t.get("landuse") in BAD_LANDUSE or t.get("natural") in ("water", "wetland", "wood", "scrub"):
        return False
    if t.get("amenity") in ("parking",) or t.get("leisure") in ("pitch", "park", "golf_course", "garden", "playground"):
        return False
    if t.get("sport") and t.get("sport") != "horse_racing" and t.get("leisure") != "track":
        return False
    return True


def sharpest(pts):
    """The sharpest turn round a ring, in degrees, read every 25m: a running rail never turns hard."""
    n = max(12, int(length(pts) / 25))
    q = tg.resample(pts, n + 1)[:-1]  # the ring's last point is its first
    worst = 0.0
    for i in range(len(q)):
        a, b, c = q[i - 2], q[i - 1], q[i]
        h1 = math.atan2(b[1] - a[1], b[0] - a[0])
        h2 = math.atan2(c[1] - b[1], c[0] - b[0])
        worst = max(worst, abs((math.degrees(h2 - h1) + 180) % 360 - 180))
    return worst


def despur(ring, gap=35, span=80):
    """A ring with its spurs cut out: wherever it runs out and comes back within a few metres of itself, the loop between goes."""
    pts = [tuple(p) for p in (ring[:-1] if ring[0] == ring[-1] else ring)]
    joins = []
    while len(pts) > 8:
        n = len(pts)
        along = [0.0]
        for a, b in zip(pts, pts[1:] + pts[:1]):
            along.append(along[-1] + tg.seglen(a, b))
        total = along[-1]
        best = None
        for i in range(n):
            for j in range(i + 2, n):
                run = along[j] - along[i]
                if span < run < total / 2 and tg.seglen(pts[i], pts[j]) < gap and (best is None or run > best[0]):
                    best = (run, i, j)
        if not best:
            break
        _, i, j = best
        joins = [k if k <= i else k - (j - i - 1) for k in joins if k <= i or k >= j] + [i]
        pts = pts[: i + 1] + pts[j:]
    # Ease each join where a spur came out, a few points either side, so the line has no kink.
    n = len(pts)
    for _ in range(4):
        for k0 in joins:
            for k in range(k0 - 2, k0 + 4):
                a, b, c = pts[(k - 1) % n], pts[k % n], pts[(k + 1) % n]
                pts[k % n] = ((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3)
    return pts + [pts[0]]


def find_rings(ways, centre, within=None):
    """The course (inner rail) and, when mapped, the outer rail around it."""
    rings = []
    for w in ways:
        pts, t = w["pts"], w["tags"]
        if len(pts) < 8 or pts[0] != pts[-1] or not usable(t):
            continue
        L = length(pts)
        if not (850 <= L <= 4600):
            continue
        c = centroid(pts)
        if math.hypot(c[0] - centre[0], c[1] - centre[1]) > 1300:
            continue
        shape = area(pts) / (L * L)
        if shape < 0.012:
            continue
        rings.append({"pts": pts, "L": L, "tags": t, "id": w["id"]})
    # A course is a ring 1,000m to 2,800m round; the outer rail, if mapped, runs round it 8m to 60m out.
    best = None
    for r in rings:
        if sharpest(r["pts"]) > 30:
            # A course drawn with its chutes or a cross-course in the same line: cut the spurs out and try again.
            clean = despur(r["pts"])
            if sharpest(clean) <= 30:
                r = {**r, "pts": clean, "L": length(clean)}
        if not (1000 <= r["L"] <= 2800):
            continue
        # Inside the venue's own boundary when we have one, so the course next door is never taken.
        if within and not inside(centroid(r["pts"]), within):
            continue
        # A fence or a site boundary has corners; the course has none.
        if sharpest(r["pts"]) > 30:
            continue
        sample = r["pts"][:: max(1, len(r["pts"]) // 40)]
        outer = None
        for o in rings:
            if o["id"] == r["id"] or o["L"] <= r["L"]:
                continue
            if not all(inside(p, o["pts"]) for p in sample[::4]):
                continue
            gaps = sorted(near(p, o["pts"]) for p in sample)
            g = gaps[len(gaps) // 2]
            if 6 <= g <= 60 and (outer is None or g < outer[1]):
                outer = (o, g)
        tagged = r["tags"].get("leisure") in ("track", "racetrack") or r["tags"].get("sport") == "horse_racing" or not r["tags"]
        # Prefer a ring with an outer rail, then one tagged as a track or left untagged (a relation member), then the longest.
        key = (outer is not None, tagged, r["L"])
        if best is None or key > best[0]:
            best = (key, r, outer)
    if not best:
        return None, None, None
    return best[1], (best[2][0] if best[2] else None), (best[2][1] if best[2] else None)


def find_chutes(inner, outer, gap):
    """Where the outer rail pulls well away from the inner and comes back: tip, walls."""
    if not outer:
        return []
    pts = outer["pts"][:-1]
    n = len(pts)
    d = [near(p, inner["pts"]) for p in pts]
    far = [x > max(gap * 2.2, gap + 25) for x in d]
    if all(far) or not any(far):
        return []
    # Start the scan at a point on the course so no spur is split across the wrap.
    s0 = far.index(False)
    order = [(s0 + i) % n for i in range(n)]
    spans, cur = [], []
    for i in order:
        if far[i]:
            cur.append(i)
        elif cur:
            spans.append(cur)
            cur = []
    if cur:
        spans.append(cur)
    chutes = []
    for sp in spans:
        depth = max(d[i] for i in sp)
        if depth < 45:
            continue
        tip = max(sp, key=lambda i: d[i])
        a, b = (sp[0] - 1) % n, (sp[-1] + 1) % n
        chutes.append({"tipIndex": tip, "mouth": (a, b), "depth": depth})
    return chutes


def walk(n, a, b):
    """Indices from a to b going forward round a ring of n."""
    out = [a]
    while out[-1] != b:
        out.append((out[-1] + 1) % n)
    return out


def build(slug, path, state, venue=None):
    data = json.load(open(path, encoding="utf-8"))
    els = [e for e in data["elements"] if e.get("geometry")]
    if not els:
        return {"slug": slug, "ok": False, "why": "no lines"}
    lat0 = sum(p["lat"] for e in els for p in e["geometry"]) / sum(len(e["geometry"]) for e in els)
    ways = [{"id": e["id"], "tags": e.get("tags", {}), "pts": tg.local(e["geometry"], lat0)} for e in els]
    # Centre on what is tagged as horse racing; a long creek or road would drag the middle of everything off the course.
    # The venue's own feature first: a neighbour (Eagle Farm beside Doomben) is horse racing too.
    own = [p for w in ways if venue and f"way/{w['id']}" == venue for p in w["pts"]]
    racing = own or [p for w in ways if w["tags"].get("sport") == "horse_racing" for p in w["pts"]]
    allpts = racing or [p for w in ways if length(w["pts"]) < 5000 for p in w["pts"]] or [p for w in ways for p in w["pts"]]
    centre = centroid(allpts)
    inner, outer, gap = find_rings(ways, centre, own if len(own) > 8 and own[0] == own[-1] else None)
    if slug in NO_OUTER:
        outer, gap = None, None
    if not inner:
        return {"slug": slug, "ok": False, "why": "no course ring found"}
    clockwise = state not in ANTICLOCKWISE
    loop = inner["pts"]
    ar = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(loop, loop[1:])) / 2
    if (ar > 0) != clockwise:
        loop = loop[::-1]
    # Every map drawn like Flemington's: the track as wide, for the size of the map, as its 29m is on its 1,310m frame.
    xs0, ys0 = [x for x, _ in loop], [y for _, y in loop]
    half = max(max(xs0) - min(xs0), max(ys0) - min(ys0)) * 29.4 / 1310 / 2
    run = ring_offset(loop, half)
    # Drawn rails: the inner as mapped, the outer an even width out, so a jagged or fenced outer ring never shows.
    clean_outer = ring_offset(loop, half * 2)
    rail = loop[:-1] + [loop[0]]
    along = [0.0]
    for a, b in zip(rail, rail[1:]):
        along.append(along[-1] + tg.seglen(a, b))
    total = along[-1]

    def rail_along(p):
        best = (1e18, 0.0, p)
        for i, (a, b) in enumerate(zip(run, run[1:])):
            L = tg.seglen(a, b)
            if L == 0:
                continue
            t = max(0.0, min(1.0, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L)))
            q = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
            dd = tg.seglen(p, q)
            if dd < best[0]:
                best = (dd, along[i] + t * (along[i + 1] - along[i]), q)
        return best[1], best[2]

    # Chutes, with their lines down the middle and eased into the course.
    chutes = []
    for c in find_chutes(inner, outer, gap or 25):
        n = len(outer["pts"]) - 1
        a, b = c["mouth"]
        tip = c["tipIndex"]
        cfg = {"tip": [tip], "mouth": [a, b]}
        # Walls run from the tip back to each side of the mouth.
        wall_a = [outer["pts"][i] for i in reversed(walk(n, a, tip))]
        wall_b = [outer["pts"][i] for i in walk(n, tip, b)]
        try:
            line, ja = chute_from_walls(wall_a, wall_b, run, along, total, rail_along)
        except Exception:
            continue
        line = smooth(straight_tip(line))
        chutes.append({"line": line, "joinAlong": ja, "length": length(line), "depth": c["depth"], "rails": chute_rails(line, run, half, clean_outer)})

    # The post: in front of the main stand, fine-tuned so the chutes land on standard starts.
    stand = grandstand(ways, loop, outer["pts"] if outer else loop)
    straights = straights_of(run, along)
    if stand:
        base, _ = rail_along(stand)
        how = "grandstand"
    elif straights:
        # The end of the longest straight, the way they run.
        s = max(straights, key=lambda s: s[1] - s[0])
        base = s[0] + (s[1] - s[0]) * 0.85
        how = "longest straight"
    else:
        base, how = 0.0, "guess"
    post_along, fit = base, None
    if len(chutes) >= 1:
        best = None
        window = 250 if how == "grandstand" else 600
        for dlt in range(-window, window + 1, 2):
            a = (base + dlt) % total
            err = 0
            for c in chutes:
                sd = c["length"] + (a - c["joinAlong"]) % total
                err += min(abs(sd - s) for s in STARTS)
            err += abs(dlt) * 0.02
            if best is None or err < best[0]:
                best = (err, a)
        post_along, fit = best[1], best[0]
    if slug in POST:
        post_along, how, fit = float(POST[slug]), "by hand", None
    post = tg.point_at(run, along, post_along)
    for c in chutes:
        c["startDistance"] = round(c["length"] + (post_along - c["joinAlong"]) % total)
        c["measured"] = c["startDistance"]
        if slug in CHUTE_STARTS:
            c["startDistance"] = min(CHUTE_STARTS[slug], key=lambda d: abs(d - c["startDistance"]))
    # A chute stands well clear of the course and starts a distance they race; a bulge in the outer rail on a turn does neither.
    dense = tg.resample(run, max(200, int(total / 5)))
    chutes = [c for c in chutes if to_line(c["line"][0], dense) >= 70 and abs(c["measured"] - c["startDistance"]) <= 80 and (slug in CHUTE_STARTS or min(abs(c["startDistance"] - d) for d in STARTS) <= 25)]
    # One chute to a start: the one that measures closest.
    chutes = [c for c in chutes if c is min((o for o in chutes if o["startDistance"] == c["startDistance"]), key=lambda o: abs(o["measured"] - o["startDistance"]))]
    for c in chutes:
        print(f"  {slug} chute {c['startDistance']} measured {c['measured']}", file=sys.stderr)
    per_chute = (fit / len(chutes)) if chutes and fit is not None else None
    confidence = "high" if how == "by hand" or (how == "grandstand" and (per_chute is None or per_chute < 25)) or (per_chute is not None and per_chute < 12 and len(chutes) >= 2) else "medium" if how == "grandstand" or (per_chute is not None and per_chute < 30) else "low"

    outer_parts = open_rail(clean_outer, [(c["rails"][0], c["rails"][-1]) for c in chutes])
    every = clean_outer + loop + [p for c in chutes for p in c["rails"]]
    xs = [x for x, _ in every]
    ys = [y for _, y in every]
    ox, oy = min(xs), min(ys)
    sh = lambda pts: [[round(x - ox, 1), round(y - oy, 1)] for x, y in pts]
    out = {
        "name": slug,
        "clockwise": clockwise,
        "width": round(max(xs) - ox, 1),
        "height": round(max(ys) - oy, 1),
        "outer": sh(clean_outer),
        "outerParts": [sh(p) for p in outer_parts],
        "inner": sh(loop),
        "loop": sh(run),
        "loopAlong": [round(a, 1) for a in along],
        "loopLength": round(total, 1),
        "postAlong": round(post_along, 1),
        "post": sh([post])[0],
        "chutes": [{"name": f"chute {i + 1}", "line": sh(c["line"]), "joinAlong": round(c["joinAlong"], 1), "length": round(c["length"], 1), "startDistance": c["startDistance"], "straight": False, "rails": sh(c["rails"])} for i, c in enumerate(chutes)],
        "attribution": "Map data (c) OpenStreetMap contributors",
        "auto": {"confidence": confidence, "post": how, "chuteError": round(per_chute, 1) if per_chute is not None else None, "outerRail": bool(outer)},
    }
    # A rebuild keeps the hand review.
    dest = f"src/lib/tracks/{slug}.json"
    if os.path.exists(dest):
        was = json.load(open(dest, encoding="utf-8")).get("auto") or {}
        if was.get("reviewed"):
            out["auto"]["reviewed"] = was["reviewed"]
    json.dump(out, open(dest, "w", encoding="utf-8"))
    return {"slug": slug, "ok": True, "loop": round(total), "chutes": [c["startDistance"] for c in chutes], "post": how, "confidence": confidence, "outer": bool(outer)}


def open_rail(ring, mouths):
    """The outer rail as pieces, with an opening between each chute's two sides where it comes onto the course."""
    pts = tg.resample(ring, max(600, int(length(ring) / 2)))[:-1]
    n = len(pts)
    cut = [False] * n
    for a, b in mouths:
        i = min(range(n), key=lambda k: tg.seglen(pts[k], a))
        j = min(range(n), key=lambda k: tg.seglen(pts[k], b))
        fwd = (j - i) % n
        span = range(i, i + fwd + 1) if fwd <= n - fwd else range(j, j + (n - fwd) + 1)
        for k in span:
            cut[k % n] = True
    if not any(cut):
        return [pts + [pts[0]]]
    s0 = cut.index(True)
    parts, cur = [], []
    for k in range(1, n + 1):
        i = (s0 + k) % n
        if cut[i]:
            if len(cur) > 1:
                parts.append(cur)
            cur = []
        else:
            cur.append(pts[i])
    if len(cur) > 1:
        parts.append(cur)
    return parts


def ring_offset(ring, d):
    """A closed ring moved d metres outward, square to itself at every point."""
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    cx, cy = centroid(pts)
    n = len(pts)
    out = []
    for i, p in enumerate(pts):
        a, b = pts[i - 1], pts[(i + 1) % n]
        L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        nx, ny = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
        if (p[0] - cx) * nx + (p[1] - cy) * ny < 0:
            nx, ny = -nx, -ny
        out.append((p[0] + nx * d, p[1] + ny * d))
    return out + [out[0]]


def smooth(pts, passes=3):
    """A moving average that keeps both ends: takes the jags out of a line traced from the map."""
    pts = [tuple(p) for p in pts]
    for _ in range(passes):
        pts = [pts[0]] + [((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3) for a, b, c in zip(pts, pts[1:], pts[2:])] + [pts[-1]]
    return pts


def to_line(p, pts):
    return min(tg.seglen(p, q) for q in pts)


def chute_rails(line, run, half, outer_ring):
    """Two rails either side of a chute, closed across the tip, each run on from the mouth to the course's outer rail."""
    tip, mouth = line[0], line[min(23, len(line) - 1)]  # the straight part: tip to mouth, then the ease into the course
    L = tg.seglen(tip, mouth) or 1
    ux, uy = (mouth[0] - tip[0]) / L, (mouth[1] - tip[1]) / L
    nx, ny = -uy, ux
    rail = tg.resample(outer_ring, max(600, int(length(outer_ring) / 2)))
    sides = []
    for sgn in (1, -1):
        start = (tip[0] + sgn * nx * half, tip[1] + sgn * ny * half)
        d, best = L * 0.3, None
        while d < L + 250:
            q = (start[0] + ux * d, start[1] + uy * d)
            gap = to_line(q, rail)
            if inside(q, outer_ring) or gap <= 2:
                best = (0, d)
                break
            if best is None or gap < best[0]:
                best = (gap, d)
            d += 2
        end = (start[0] + ux * best[1], start[1] + uy * best[1])
        # A side running alongside the rail without touching it steps across at its closest.
        near = min(rail, key=lambda r: tg.seglen(r, end))
        sides.append([start, end, near])
    a, b = sides
    return list(reversed(a)) + b


def straight_tip(line):
    """Drops the first points of a chute's middle while they turn hard off its run: the hook a traced tip leaves."""
    line = list(line)
    while len(line) > 6:
        a, b, c = line[0], line[1], line[4]
        h1 = math.atan2(b[1] - a[1], b[0] - a[0])
        h2 = math.atan2(c[1] - b[1], c[0] - b[0])
        if abs((math.degrees(h2 - h1) + 180) % 360 - 180) <= 25:
            break
        line.pop(0)
    return line


def chute_from_walls(wall_a, wall_b, run, along, total, rail_along):
    n = 24
    a, b = tg.resample(wall_a, n), tg.resample(wall_b, n)
    middle = [((p[0] + q[0]) / 2, (p[1] + q[1]) / 2) for p, q in zip(a, b)]
    # A chute is dead straight: tip to mouth in a line, whatever wobble the traced walls have.
    t0, t1 = middle[0], middle[-1]
    middle = [(t0[0] + (t1[0] - t0[0]) * k / (n - 1), t0[1] + (t1[1] - t0[1]) * k / (n - 1)) for k in range(n)]
    m = middle[-1]
    ux, uy = m[0] - middle[-4][0], m[1] - middle[-4][1]
    un = math.hypot(ux, uy) or 1
    ux, uy = ux / un, uy / un
    a0, q = rail_along(m)
    gap = tg.seglen(m, q)
    ease = max(40.0, min(120.0, gap * 3 + 30))
    # Ease in the way they run: whichever direction round the course the chute points.
    ahead = tg.point_at(run, along, (a0 + 10) % total)
    fwd = (ahead[0] - q[0]) * ux + (ahead[1] - q[1]) * uy >= 0
    join_along = (a0 + ease) % total if fwd else (a0 + ease) % total
    j = tg.point_at(run, along, join_along)
    j2 = tg.point_at(run, along, (join_along + 5) % total)
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


def grandstand(ways, loop, outer):
    """The main stand's middle: a building called a stand, else the biggest building hard by the outer rail."""
    best = None
    for w in ways:
        t = w["tags"]
        if "building" not in t or len(w["pts"]) < 4:
            continue
        c = centroid(w["pts"])
        d = near(c, outer)
        if d > 140 or inside(c, loop):
            continue
        ar = area(w["pts"]) if w["pts"][0] == w["pts"][-1] else 0
        named = t.get("building") == "grandstand" or "stand" in t.get("name", "").lower()
        key = (named, ar)
        if ar < 150 and not named:
            continue
        if best is None or key > best[0]:
            best = (key, c)
    return best[1] if best else None


def straights_of(run, along):
    """Stretches where the heading holds within 8 degrees for 150m or more: (from, to) in rail metres."""
    heads = []
    for i, (a, b) in enumerate(zip(run, run[1:])):
        heads.append((along[i], along[i + 1], math.atan2(b[1] - a[1], b[0] - a[0])))
    out, s = [], None
    for f, t, h in heads:
        if s is None:
            s = [f, t, h]
            continue
        dh = abs((h - s[2] + math.pi) % (2 * math.pi) - math.pi)
        if dh < math.radians(8):
            s[1] = t
        else:
            if s[1] - s[0] >= 150:
                out.append((s[0], s[1]))
            s = [f, t, h]
    if s and s[1] - s[0] >= 150:
        out.append((s[0], s[1]))
    return out


def main():
    d = sys.argv[1]
    index = json.load(open(os.path.join(d, "_index.json"), encoding="utf-8"))
    manual = {"flemington", "caulfield"}
    report = []
    for track, f in index.items():
        slug = "".join(ch for ch in track.lower() if ch.isalpha())
        if slug in manual:
            continue
        path = os.path.join(d, slug + ".json")
        if not os.path.exists(path):
            report.append({"slug": slug, "ok": False, "why": "not downloaded"})
            continue
        try:
            r = build(slug, path, f["state"], f.get("osm"))
        except Exception as e:
            r = {"slug": slug, "ok": False, "why": f"error {e}"}
        r["track"] = track
        report.append(r)
        print(json.dumps(r))
    json.dump(report, open(os.path.join(d, "_report.json"), "w", encoding="utf-8"), indent=1)


if __name__ == "__main__":
    main()
