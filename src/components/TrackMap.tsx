import { TRACKS } from "@/lib/tracks";

/**
 * The track as a line drawing with this race's run on it: the outer rail and
 * the course in grey, and the path from the start to the post highlighted,
 * arrows showing the way they race. A start in a chute runs out of it; a
 * distance longer than the course adds the laps. Outlines from
 * OpenStreetMap, built by scripts/track-geometry.py.
 */
export interface Track {
  name: string;
  clockwise: boolean;
  width: number;
  height: number;
  outer: number[][];
  /** The inner rail, drawn; `loop` is the middle of the track, which the run follows. */
  inner: number[][];
  loop: number[][];
  /** Each loop point's official distance round the course, measured along the rail. */
  loopAlong: number[];
  loopLength: number;
  postAlong: number;
  post: number[];
  chutes: { name: string; line: number[][]; joinAlong: number; length: number; startDistance: number; straight: boolean }[];
  attribution: string;
  /** How sure the automatic build is of the post, for tracks not set up by hand. */
  auto?: { confidence: string; post: string; chuteError: number | null; outerRail: boolean };
}


export const trackMapFor = (trackName?: string): Track | undefined => TRACKS[(trackName ?? "").toLowerCase().replace(/[^a-z]/g, "")];

type Pt = [number, number];
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** The point `along` metres round the loop, and the loop's points between two distances, in running order. */
function loopPoints(t: Track, from: number, to: number): Pt[] {
  const pts = t.loop as Pt[];
  const along = t.loopAlong;
  // Distances are along the rail, official ones; the points are on the middle of the track.
  const at = (a: number): Pt => {
    const d = ((a % t.loopLength) + t.loopLength) % t.loopLength;
    for (let i = 0; i < pts.length - 1; i++) {
      const L = along[i + 1] - along[i];
      if (d <= along[i + 1] && L > 0) {
        const f = (d - along[i]) / L;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
      }
    }
    return pts[0];
  };
  const out: Pt[] = [at(from)];
  // Walk the vertices between, in order, wrapping as often as the laps need.
  const vertex = along.slice(0, -1);
  for (let lap = Math.floor(from / t.loopLength) - 1; lap <= Math.ceil(to / t.loopLength) + 1; lap++) {
    for (let i = 0; i < vertex.length; i++) {
      const a = lap * t.loopLength + vertex[i];
      if (a > from && a < to) out.push(pts[i]);
    }
  }
  out.push(at(to));
  return out;
}

/**
 * The run from the start to the post, as points. Past a lap the part left over
 * starts where a race of that length would, in a chute or up the straight, and
 * the laps follow: the Cup's 3200m at Flemington starts up the straight 888m
 * from the post, runs past it, then goes once round.
 */
export function racePath(t: Track, distance: number): { path: Pt[]; start: Pt } {
  const laps = Math.floor((distance - 50) / t.loopLength);
  if (laps > 0) {
    const first = racePathUnderLap(t, distance - laps * t.loopLength);
    return { path: [...first.path, ...loopPoints(t, t.postAlong, t.postAlong + laps * t.loopLength).slice(1)], start: first.start };
  }
  return racePathUnderLap(t, distance);
}

function racePathUnderLap(t: Track, distance: number): { path: Pt[]; start: Pt } {
  const straight = t.chutes.find((c) => c.straight);
  // Up the straight: a start on it, running to the post.
  if (straight && distance <= straight.length + 60) {
    const [tip, post] = straight.line as Pt[];
    const f = Math.max(0, 1 - distance / straight.length);
    const start: Pt = [tip[0] + (post[0] - tip[0]) * f, tip[1] + (post[1] - tip[1]) * f];
    return { path: [start, post], start };
  }
  // Out of a chute: the shortest chute whose start is at or beyond this distance and whose mouth is inside it.
  const chute = t.chutes
    .filter((c) => !c.straight && c.startDistance - c.length < distance && distance <= c.startDistance + 60)
    .sort((a, b) => a.startDistance - b.startDistance)[0];
  if (chute) {
    const line = chute.line as Pt[];
    const into = Math.min(chute.length, chute.length - (chute.startDistance - distance));
    // Walk back from the join to find the start inside the chute.
    const rev = [...line].reverse();
    let left = into;
    const part: Pt[] = [rev[0]];
    for (let i = 0; i < rev.length - 1; i++) {
      const L = dist(rev[i], rev[i + 1]);
      if (left <= L) {
        part.push([rev[i][0] + ((rev[i + 1][0] - rev[i][0]) * left) / L, rev[i][1] + ((rev[i + 1][1] - rev[i][1]) * left) / L]);
        break;
      }
      part.push(rev[i + 1]);
      left -= L;
    }
    const chutePart = part.reverse();
    const toPost = ((t.postAlong - chute.joinAlong) % t.loopLength + t.loopLength) % t.loopLength;
    return { path: [...chutePart, ...loopPoints(t, chute.joinAlong, chute.joinAlong + toPost).slice(1)], start: chutePart[0] };
  }
  // On the course: back from the post by the distance, laps and all.
  const path = loopPoints(t, t.postAlong - distance + t.loopLength * Math.ceil(distance / t.loopLength), t.postAlong + t.loopLength * Math.ceil(distance / t.loopLength));
  return { path, start: path[0] };
}

/** Arrows along a path, every `every` metres, pointing the way they race. */
function arrows(path: Pt[], every: number): { at: Pt; angle: number }[] {
  const out: { at: Pt; angle: number }[] = [];
  let next = every / 2;
  let run = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const L = dist(path[i], path[i + 1]);
    while (next <= run + L && L > 0) {
      const f = (next - run) / L;
      out.push({ at: [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f], angle: (Math.atan2(path[i + 1][1] - path[i][1], path[i + 1][0] - path[i][0]) * 180) / Math.PI });
      next += every;
    }
    run += L;
  }
  return out;
}

const line = (pts: number[][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

/**
 * The turn that puts the home straight along the bottom, running to the right
 * into the post at the bottom right; a clockwise track runs right to left along
 * it, so its post sits bottom left (mirroring it would show them racing the
 * wrong way).
 */
function homeStraightDown(t: Track): number {
  const run = loopPoints(t, t.postAlong - 60, t.postAlong);
  const [a, b] = [run[0], run[run.length - 1]];
  const heading = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return (t.clockwise ? 180 : 0) - heading;
}

export function TrackMap({ track, distance, className = "" }: { track: Track; distance: number; className?: string }) {
  const pad = 60;
  const { path, start } = racePath(track, distance);
  const total = path.reduce((a, p, i) => (i ? a + dist(path[i - 1], p) : 0), 0);
  const marks = arrows(path, Math.max(250, total / 7));
  // The frame round the turned drawing.
  const turn = homeStraightDown(track);
  const r = (turn * Math.PI) / 180;
  const turned = [...track.outer, ...track.inner, ...track.loop].map(([x, y]) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]);
  const minX = Math.min(...turned.map((p) => p[0])), maxX = Math.max(...turned.map((p) => p[0]));
  const minY = Math.min(...turned.map((p) => p[1])), maxY = Math.max(...turned.map((p) => p[1]));
  return (
    <figure className={`track-map ${className}`}>
      <svg viewBox={`${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${(maxX - minX + pad * 2).toFixed(0)} ${(maxY - minY + pad * 2).toFixed(0)}`} role="img" aria-label={`${track.name} ${distance}m: the run from the start to the post`}>
        <g transform={`rotate(${turn.toFixed(2)})`}>
        <path d={line(track.outer)} className="track-rail" />
        {track.inner.length > 0 && <path d={line(track.inner)} className="track-rail" />}
        <path d={line(path)} className="track-run" />
        {marks.map((m, i) => (
          <path key={i} d="M-14,-10 L4,0 L-14,10" className="track-arrow" transform={`translate(${m.at[0].toFixed(1)},${m.at[1].toFixed(1)}) rotate(${m.angle.toFixed(1)})`} />
        ))}
        <circle cx={start[0]} cy={start[1]} r={26} className="track-start" />
        <circle cx={track.post[0]} cy={track.post[1]} r={26} className="track-post" />
        </g>
      </svg>
      <figcaption className="track-legend">
        <span><i className="dot start" />Start</span>
        <span><i className="dot post" />Post</span>
        <span className="track-credit">{track.attribution.replace("(c)", "©")}</span>
      </figcaption>
    </figure>
  );
}
