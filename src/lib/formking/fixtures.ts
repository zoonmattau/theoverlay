/**
 * Deterministic sample card for local development.
 *
 * Shaped like the Form King API (b2c-openapi.yaml) but generated, not copied:
 * no licensed data lives in this repo. Swap to the real client by setting
 * FORMKING_API_KEY.
 */

import type {
  BenchmarkedRun,
  BenchmarkedSection,
  MeetingSummary,
  PastEvent,
  RaceEntry,
  RaceSummary,
  SectionKey,
  Speedmap,
} from "./types";

const FIRST = [
  "Bold", "Silent", "Northern", "Kembla", "Autumn", "River", "Quiet", "Harbour", "Stolen",
  "Paper", "Winter", "Red", "Glass", "Long", "Wandering", "Iron", "Blue", "Night", "Final",
  "Marble", "Ghost", "Sovereign", "Lantern", "Clear",
];
const SECOND = [
  "Contender", "Partner", "Drift", "Rose", "Gold", "Stakes", "Achiever", "Lights", "Thunder",
  "Crown", "Solstice", "Letter", "House", "Division", "Star", "Ledger", "Ribbon", "Train",
  "Furlong", "Arch",
];
/** Every pairing, shuffled once, so no name repeats across the day's card. */
const HORSES = FIRST.flatMap((a) => SECOND.map((b) => `${a} ${b}`)).sort(
  (a, b) => hash(a) - hash(b),
);

const JOCKEYS = [
  "J McDonald", "N Rawiller", "T Berry", "K McEvoy", "R King", "T Nugent",
  "J Collett", "S Clipperton", "A Adkins", "B Shinn", "J Parr", "R Dolan",
];

const TRAINERS = [
  "C Waller", "C Maher", "A Freedman", "J Cummings", "G Waterhouse & A Bott",
  "B, W & J Hayes", "M, W & J Hawkes", "P & P Snowden", "K Lees", "J Thompson",
];

/** Mulberry32, a small deterministic PRNG so the sample card never shifts. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MEETINGS = [
  { id: "randwick", code: "RAND", track: "Randwick", state: "NSW", going: "Good", goingNumber: 4, rail: "+3m 1000m-W/Post, True Remainder" },
  { id: "flemington", code: "FLEM", track: "Flemington", state: "VIC", going: "Soft", goingNumber: 5, rail: "True Entire Circuit" },
  { id: "eagle-farm", code: "E FM", track: "Eagle Farm", state: "QLD", going: "Heavy", goingNumber: 8, rail: "+6m Entire" },
];

/** Race classes as Form King prints them, with the benchmark points they sit at. */
const CLASSES: { code: string; name: string; points: number }[] = [
  { code: "G1...", name: "(Group 1)", points: 122 },
  { code: "G2...", name: "(Group 2)", points: 112 },
  { code: "G3...", name: "(Group 3)", points: 104 },
  { code: "LR...", name: "(Listed)", points: 96 },
  { code: "78B.3+..", name: "(Bm78)", points: 78 },
  { code: "72B.3+..", name: "Midway (Bm72)", points: 72 },
  { code: "64B...", name: "(Bm64)", points: 64 },
  { code: "C3.3+..", name: "Class 3 Hcp", points: 66 },
  { code: "C1...", name: "Class 1 Hcp", points: 58 },
  { code: "MDN.3+..S", name: "Mdn Plate", points: 52 },
];
const GOINGS = ["Good 4", "Good 4", "Good 3", "Soft 5", "Soft 6", "Heavy 8"];

/** The three classes nearest a rating, for where a horse has been running. */
function classesNear(points: number) {
  return [...CLASSES]
    .sort((a, b) => Math.abs(a.points - points) - Math.abs(b.points - points))
    .slice(0, 3);
}

/** Benchmarked sections for a run, given how far above par it ran and its shape. */
function sections(
  rand: () => number,
  distance: number,
  overall: number,
  earlyTrait: number,
  leaderEarly: number,
): Partial<Record<SectionKey, BenchmarkedSection>> {
  const out: Partial<Record<SectionKey, BenchmarkedSection>> = {};
  const mk = (vsClass: number, vsLeader: number): BenchmarkedSection => ({
    vsClass: round2(vsClass),
    vsAllAvg: round2(vsClass + rand() * 0.4 - 0.2),
    vsTrack: round2(vsClass + rand() * 0.6 - 0.3),
    vsField: round2(vsClass * 0.5 + rand() * 0.4 - 0.2),
    vsLeader: round2(vsLeader),
    vsWinner: round2(vsLeader + rand() * 0.3),
  });
  const early = overall * 0.4 + earlyTrait * 1.2 + rand() * 0.4 - 0.2;
  const late = overall * 0.5 - earlyTrait * 0.6 + rand() * 0.4 - 0.2;
  const mid = overall * 0.3 + rand() * 0.4 - 0.2;
  const startKey: SectionKey = distance >= 1400 ? "S-12" : distance >= 1200 ? "S-8" : "S-6";
  out[startKey] = mk(early, early - leaderEarly);
  if (!out["S-6"]) out["S-6"] = mk(early * 0.9, early * 0.9 - leaderEarly);
  if (distance >= 1400) out["12-10"] = mk(mid, mid - rand() * 0.5);
  if (distance >= 1200) out["8-6"] = mk(mid, mid - rand() * 0.5);
  out["6-4"] = mk(mid * 0.8, mid * 0.8 - rand() * 0.5);
  out["6-F"] = mk(late, late - rand() * 0.5);
  out["4-F"] = mk(late * 0.7, late * 0.7 - rand() * 0.5);
  out["2-F"] = mk(late * 0.4, late * 0.4 - rand() * 0.5);
  return out;
}

function buildPastEvents(
  rand: () => number,
  date: string,
  ability: number,
  traits: { early: number; wet: number; pressure: number },
): PastEvent[] {
  const count = 3 + Math.floor(rand() * 4);
  const races = Array.from({ length: count }, (_, k) => {
    const cls = classesNear(ability)[Math.floor(rand() * 3)];
    const going = GOINGS[Math.floor(rand() * GOINGS.length)];
    const wet = going.startsWith("Heavy") ? 1 : going.startsWith("Soft") ? 0.5 : 0;
    // How hard the leaders went, in lengths above par early: positive is a hot tempo.
    const leaderEarly = rand() * 5 - 2.5;
    const hot = leaderEarly > 1 ? 1 : leaderEarly < -1 ? -0.5 : 0;

    // Performance on the day in points, moved by ground and tempo, plus noise.
    const perf = ability + traits.wet * wet * 5 + traits.pressure * hot * 3 + rand() * 6 - 3;
    const gap = perf - cls.points;
    const lengths = gap / 1.5;
    const margin = Math.max(0, round2(2.5 - lengths + rand() * 4 - 2));
    const finishPosition = Math.max(1, Math.min(14, Math.round(1 + margin * 1.2)));
    const distance = [1000, 1200, 1400, 1600, 2000][Math.floor(rand() * 5)];
    const numRunners = 8 + Math.floor(rand() * 6);

    const back = new Date(`${date}T00:00:00.000Z`);
    back.setUTCDate(back.getUTCDate() - (14 + k * 21 + Math.floor(rand() * 10)));

    const benchmark: BenchmarkedRun = {
      dataStage: "FULL_SECTIONAL_DATA",
      vsClass: round2(lengths),
      vsAllAvg: round2(lengths + rand() * 0.6 - 0.3),
      vsTrack: round2(lengths + rand() * 1 - 0.5),
      finishingSpeed: round2(100 + (traits.pressure - traits.early) * 3 + rand() * 2),
      speedRating: round2(100 + lengths * 1.5),
      atWeights: round2(perf + 14),
      wfaRat: round2(perf + 13),
      raceRunners: numRunners,
      sp: round1(2 + Math.pow(rand(), 1.5) * 30),
      pir2: Math.max(1, Math.round(numRunners * (0.5 - traits.early * 0.4) + rand() * 2 - 1)),
      pir4: Math.max(1, Math.round(numRunners * (0.5 - traits.early * 0.35) + rand() * 2 - 1)),
      pir6: Math.max(1, Math.round(numRunners * (0.5 - traits.early * 0.3) + rand() * 2 - 1)),
      sections: sections(rand, distance, lengths, traits.early, leaderEarly),
    };

    const event: PastEvent = {
      race: true,
      date: back.getTime(),
      raceId: `${MEETINGS[Math.floor(rand() * MEETINGS.length)].code}_${k}`,
      track: MEETINGS[Math.floor(rand() * MEETINGS.length)].track,
      raceNumber: 1 + Math.floor(rand() * 9),
      raceName: cls.name,
      distance,
      going,
      barrier: 1 + Math.floor(rand() * numRunners),
      weight: round1(54 + rand() * 6),
      finishPosition,
      margin: finishPosition === 1 ? 0 : margin,
      numRunners,
      posSettling: benchmark.pir6,
      pos400m: Math.max(1, Math.round(finishPosition + rand() * 2 - 1)),
      startingPrice: benchmark.sp,
      bsp: round2((benchmark.sp ?? 5) * (1 + rand() * 0.2)),
      benchmarkRating: Math.round(ability + rand() * 4 - 2),
      weightForAgeRating: benchmark.wfaRat,
      daysSincePreviousRace: k === count - 1 ? 120 : 14 + Math.floor(rand() * 21),
      benchmark: k < 5 ? benchmark : undefined,
    };
    return event;
  });

  // Newest first, as the API returns them.
  return races.sort((a, b) => b.date - a.date);
}

function formString(events: PastEvent[]): string {
  return [...events]
    .sort((a, b) => a.date - b.date)
    .map((e) => (e.finishPosition && e.finishPosition >= 10 ? "0" : String(e.finishPosition)))
    .join("");
}

function buildRace(
  meeting: (typeof MEETINGS)[number],
  raceNumber: number,
  seed: number,
  slot: number,
  date: string,
): RaceSummary {
  const rand = rng(seed);
  const fieldSize = 7 + Math.floor(rand() * 8);
  const distance = [1000, 1200, 1400, 1600, 1800, 2000, 2400][Math.floor(rand() * 7)];
  // Each race takes its own slice of the pool, so no name repeats on the day.
  const offset = slot * 16;
  const cls = CLASSES[Math.floor(rand() * CLASSES.length)];

  const abilities: number[] = [];
  const entries: RaceEntry[] = Array.from({ length: fieldSize }, (_, i) => {
    // True ability in benchmark points, centred on the race's class.
    const ability = cls.points + (Math.pow(rand(), 1.6) * -10 + 4) + rand() * 4 - 2;
    abilities.push(ability);
    const traits = { early: rand() * 2 - 1, wet: rand() * 2 - 1, pressure: rand() * 2 - 1 };
    const scratched = rand() < 0.04;
    const pastEvents = rand() < 0.08 ? [] : buildPastEvents(rand, date, ability, traits);
    const weight = round1(54 + rand() * 6);
    // Form King restates each run's rating at today's weight, about 1.5
    // points a kilo, so a horse dropping weight rates up for today.
    for (const p of pastEvents) {
      if (p.weightForAgeRating && p.weight) {
        p.adjustedForTodaysWeight = round2(p.weightForAgeRating + (p.weight - weight) * 1.5);
      }
    }
    const daysSinceLastRace = pastEvents.length ? (rand() < 0.15 ? 90 + Math.floor(rand() * 60) : 14 + Math.floor(rand() * 30)) : undefined;
    return {
      number: i + 1,
      barrier: 1 + Math.floor(rand() * fieldSize),
      scratched,
      horse: { name: HORSES[offset + i], age: 3 + Math.floor(rand() * 5) },
      jockey: JOCKEYS[Math.floor(rand() * JOCKEYS.length)],
      trainer: TRAINERS[Math.floor(rand() * TRAINERS.length)],
      jockeyForm: { lastTwelveMonthWinPercentage: round1(6 + rand() * 14), lastTwelveMonthRides: 300 + Math.floor(rand() * 500) },
      trainerForm: { lastTwelveMonthWinPercentage: round1(8 + rand() * 12) },
      weight,
      benchmarkRating: pastEvents.length ? Math.round(ability + rand() * 3 - 1.5) : undefined,
      daysSinceLastRace,
      raceInPrep: daysSinceLastRace && daysSinceLastRace >= 80 ? 1 : 2 + Math.floor(rand() * 4),
      firstStarter: pastEvents.length === 0,
      form: pastEvents.length
        ? { runs: formString(pastEvents), firstUpForm: `${3 + Math.floor(rand() * 3)}:${Math.floor(rand() * 2)}-${Math.floor(rand() * 2)}-${Math.floor(rand() * 2)}` }
        : undefined,
      ratings: { peak12m: round2(ability + 14 + rand() * 3), peak: round2(ability + 15 + rand() * 3) },
      pastEvents,
    };
  });

  // Derive a market from ability, then push it around: each runner gets its
  // own multiplier and one runner per race gets a big one, because real
  // markets misprice individual horses.
  const live = entries.filter((e) => !e.scratched);
  const weights = live.map((e) => Math.exp(abilities[e.number - 1] / 5));
  const total = weights.reduce((a, b) => a + b, 0);
  const mispriced = Math.floor(rand() * live.length);
  live.forEach((e, i) => {
    const fair = weights[i] / total;
    const drift = 0.86 + rand() * 0.28;
    const shock = i === mispriced ? 0.55 + rand() * 0.3 : 1;
    const bestNow = round2(Math.min(61, Math.max(1.2, 1 / (fair * drift * shock * 1.16))));
    e.odds = {
      bestNow,
      avgNow: round2(bestNow * 0.94),
      avgOpen: round2(bestNow * (0.85 + rand() * 0.3)),
      bestBookies: ["sportsbet"],
      firmOrDrift: round2(rand() * 10 - 5),
      timestamp: Date.now(),
    };
  });

  // Stagger meetings so the cards don't all read the same first-jump time.
  const jump = new Date(`${date}T02:00:00.000Z`);
  jump.setUTCMinutes(jump.getUTCMinutes() + seedOffset(meeting.id) + raceNumber * 32);

  // Races that have already jumped get a result, so the card shows both
  // states. Finishing order leans on ability with plenty of noise.
  const resulted = jump.getTime() < Date.now() - 5 * 60_000;
  if (resulted) {
    const order = [...live].sort(
      (a, b) =>
        abilities[b.number - 1] + rand() * 8 - (abilities[a.number - 1] + rand() * 8),
    );
    order.forEach((e, pos) => {
      const sp = round1((e.odds?.bestNow ?? 10) * (0.9 + rand() * 0.2));
      e.horseResult = {
        finishPosition: pos + 1,
        margin: pos === 0 ? 0 : round2(pos * 0.8 + rand()),
        startingPrice: sp,
        betfairStartingPrice: round2(sp * (1 + rand() * 0.2)),
        toteWin: pos === 0 ? round1(sp * (0.95 + rand() * 0.15)) : 0,
        totePlace: pos < 3 ? round1(1 + (sp - 1) * 0.3) : 0,
        weight: e.weight,
      };
    });
  }

  return {
    raceId: `${meeting.code}_${ddmmyy(date)}_${raceNumber}`,
    meetingId: `${meeting.id}-${date.replace(/-/g, "")}`,
    trackName: meeting.track,
    trackCode: meeting.code,
    number: raceNumber,
    name: cls.name,
    distance,
    going: meeting.going,
    goingNumber: meeting.goingNumber,
    date: jump.getTime(),
    restrictions: cls.code,
    prizemoneyGrade: "MSAT",
    totalPrizeMoney: 50_000 + Math.floor(rand() * 20) * 25_000,
    status: resulted ? "RESULTED" : "FINAL_FIELDS",
    raceType: "Flat",
    railPosition: meeting.rail,
    numRunners: live.length,
    syntheticHold: round2(112 + rand() * 8),
    entries,
  };
}

/** Early speed is mostly a horse trait, so seed it off the horse, not the race. */
function buildSpeedmap(race: RaceSummary): Speedmap {
  const entries = race.entries.map((e) => {
    const rand = rng(hash(e.horse.name));
    const overall = round2(1 + rand() * 9);
    return {
      number: e.number,
      barrier: e.barrier,
      horse: e.horse.name,
      breedingId: `b-${hash(e.horse.name)}`,
      emergency: false,
      runInPrep: e.raceInPrep ?? 1,
      daysSinceLastRace: e.daysSinceLastRace ?? 0,
      distanceChange: 0,
      medianEarlyVsBenchmark: round2((overall - 5.5) * 0.6),
      earlySpeedValues: { overall, type: "SPEED_FIGURE" },
    };
  });
  const top = [...entries]
    .sort((a, b) => b.earlySpeedValues.overall - a.earlySpeedValues.overall)
    .slice(0, 3);
  const heat = top.reduce((a, e) => a + e.earlySpeedValues.overall, 0) / 3;
  const cat = heat >= 8.8 ? "Fast" : heat <= 6.8 ? "Slow" : "Average";
  return {
    raceId: race.raceId,
    owner: "formking",
    custom: false,
    direction: "CLOCKWISE",
    expectedTempo: { description: cat, minCategory: cat, maxCategory: cat },
    entries,
  };
}

export interface FixtureMeeting {
  meeting: MeetingSummary;
  races: RaceSummary[];
  speedmaps: Record<string, Speedmap>;
}

export function fixtureMeetings(date: string): FixtureMeeting[] {
  return MEETINGS.map((m, mi) => {
    const raceCount = 8;
    const races = Array.from({ length: raceCount }, (_, i) =>
      buildRace(m, i + 1, hash(date) + mi * 1000 + i, mi * raceCount + i, date),
    );
    const speedmaps = Object.fromEntries(races.map((r) => [r.raceId, buildSpeedmap(r)]));
    const meeting: MeetingSummary = {
      id: `${m.id}-${date.replace(/-/g, "")}`,
      trackName: m.track,
      state: m.state,
      date: new Date(`${date}T00:00:00+10:00`).getTime(),
      status: "FINAL_FIELDS",
      tabMeeting: true,
      railPosition: m.rail,
      updated: Date.now(),
      races,
    };
    return { meeting, races, speedmaps };
  });
}

/** Each track starts its card at a slightly different time, as they do. */
function seedOffset(id: string): number {
  return (hash(id) % 5) * 25;
}

function ddmmyy(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}${m}${y.slice(-2)}`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
