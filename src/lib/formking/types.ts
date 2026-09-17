/**
 * Form King Modellers API response shapes.
 *
 * PRIVATE. These types describe licensed third-party data. Nothing typed in this
 * file may be sent to the browser or persisted in a publicly-readable table.
 * See src/lib/model/publish.ts for the only sanctioned exit path.
 *
 * Field names follow b2c-openapi.yaml from
 * https://github.com/dpfundt/form-king-api-tools. Only the fields we consume
 * are typed; the API returns many more.
 */

/** Unix timestamp in milliseconds. */
export type Millis = number;

export interface MeetingSummaryLite {
  id: string;
  trackName?: string;
  state?: string;
  date?: Millis;
  status?: string;
  tabMeeting?: boolean;
  going?: string;
  goingNumber?: number;
  railPosition?: string;
  railMetres?: number;
  rainfall?: string;
  penetrometer?: string;
  races?: RaceLite[];
}

export interface RaceLite {
  raceId: string;
  number: number;
  name: string;
  distance: number;
  going: string;
  goingNumber: number;
  startTime?: string;
  restrictions: string;
  prizemoneyGrade: string;
  totalPrizeMoney: number;
  status: string;
  trackCode: string;
  raceType: string;
  lws?: number;
}

export interface MeetingSummary {
  id: string;
  trackName?: string;
  state?: string;
  date?: Millis;
  status?: string;
  tabMeeting?: boolean;
  railPosition?: string;
  railMetres?: number;
  rainfall?: string;
  penetrometer?: string;
  updated: Millis;
  races?: RaceSummary[];
}

export interface RaceSummary {
  raceId: string;
  meetingId?: string;
  trackName?: string;
  trackCode: string;
  number: number;
  name: string;
  distance: number;
  /** Official condition, e.g. "Good", "Dead", "Slow", "Heavy", "Synthetic". */
  going: string;
  goingNumber: number;
  /** Scheduled start as printed, e.g. "12:20pm" (local track time). */
  startTime?: string;
  date?: Millis;
  /** Class, age, sex and weight string, e.g. "72B.3+..", "MDN.2+..S", "C3...". */
  restrictions: string;
  /** N, C, P, MMW or MSAT. */
  prizemoneyGrade: string;
  totalPrizeMoney: number;
  status: string;
  raceType: string;
  railPosition?: string;
  numRunners?: number;
  /** Likely Winning Standard, Form King scale. NEVER publish. */
  lws?: number;
  /** Combined best-odds market percentage, e.g. 109.2. */
  syntheticHold?: number;
  entries: RaceEntry[];
}

export interface RaceEntry {
  number: number;
  barrier: number;
  scratched: boolean;
  emergency?: boolean;
  horse: { name: string; sire?: string; dam?: string; age?: number; type?: string };
  jockey?: string;
  trainer?: string;
  weight?: number;
  weightCarried?: number;
  apprenticeClaim?: number;
  /** Official Handicap Rating going into this race. */
  benchmarkRating?: number;
  daysSinceLastRace?: number;
  raceInPrep?: number;
  firstStarter?: boolean;
  form?: EntryForm;
  jockeyForm?: JockeyForm;
  trainerForm?: TrainerForm;
  odds?: RaceEntryOdds;
  /** Form King ratings for today. NEVER publish. */
  ratings?: RaceEntryRatings;
  pastEvents?: PastEvent[];
  horseResult?: HorseResult;
  /** Gear today: what is on, and whether it is a change. */
  gear?: { gear: string; change?: "STAYING_ON" | "ON_FIRST_TIME" | "OFF_FIRST_TIME" | "ON_AGAIN" | "OFF_AGAIN"; on?: boolean }[];
}

export interface EntryForm {
  careerForm?: string;
  /** Last ten results as a form string, e.g. "123292x422". */
  runs?: string;
  distanceForm?: string;
  trackForm?: string;
  classForm?: string;
  firstUpForm?: string;
  secondUpForm?: string;
  goingForm?: Record<string, string>;
}

export interface JockeyForm {
  lastTwelveMonthRides?: number;
  lastTwelveMonthWinPercentage?: number;
  lastTwelveMonthPlacePercentage?: number;
  horseComboForm?: string;
  horseComboWinPercentage?: number;
  trackComboWinPercentage?: number;
}

export interface TrainerForm {
  lastTwelveMonthWinPercentage?: number;
  horseComboForm?: string;
  jockeyComboWinPercentage?: number;
  trackComboWinPercentage?: number;
}

export interface RaceEntryOdds {
  /** Best corporate bookmaker price at the latest fluctuation. */
  bestNow: number;
  avgNow: number;
  avgOpen: number;
  bestBookies: string[];
  /** Percentage-point change in implied chance since open, negative is a drift. */
  firmOrDrift: number;
  timestamp: Millis;
  /** The exchange, from BetWatch when it is fresher than Form King: best back and lay on offer and the money at each. */
  exchange?: { back?: number; backSize?: number; lay?: number; laySize?: number; matched?: number };
  /** Where the best price came from: BetWatch's live feed, else Form King's. */
  source?: "betwatch" | "formking";
}

export interface RaceEntryRatings {
  /** Market expected rating, Form King scale. NEVER publish. */
  exp?: number;
  neural?: number;
  peak?: number;
  peak12m?: number;
}

export interface PastEvent {
  race?: boolean;
  trial?: boolean;
  spell?: boolean;
  spellDays?: number;
  scratched?: boolean;
  date: Millis;
  raceId?: string;
  meetingId?: string;
  track?: string;
  trackCode?: string;
  state?: string;
  raceNumber: number;
  /** Race name as printed, often carrying the class, e.g. "Midway (Bm72)". */
  raceName?: string;
  distance: number;
  /** Condition as printed, e.g. "Dead 5". */
  going?: string;
  barrier: number;
  weight?: number;
  finishPosition?: number;
  /** Lengths beaten, 0 for the winner. */
  margin?: number;
  numRunners?: number;
  posSettling?: number;
  /** The horse's own time for the race, milliseconds. */
  timeInMillis?: number;
  /** Its time over the final sectional, milliseconds, and how long that sectional was, metres. */
  sectionalTimeInMillis?: number;
  sectionalDistance?: number;
  pos1200m?: number;
  pos800m?: number;
  pos400m?: number;
  startingPrice?: number;
  bsp?: number;
  daysSincePreviousRace?: number;
  raceInPrep?: number;
  /** Official Handicap Rating going into that race. */
  benchmarkRating?: number;
  /** Form King performance ratings for this run. NEVER publish. */
  weightForAgeRating?: number;
  adjustedForTodaysWeight?: number;
  trackSpeed?: number;
  /** Sectional benchmarks. Pro tier only. NEVER publish. */
  benchmark?: BenchmarkedRun;
  /** The placegetters in that race, public results. */
  placings?: { finishPosition: number; horse: string; jockey?: string; margin?: number; weight?: number; barrier?: number; thisHorse?: boolean }[];
}

/** Section keys: "S-6" is start to the 600m, "6-F" is the last 600m. */
export type SectionKey =
  | "S-12" | "S-10" | "S-8" | "S-6" | "S-4" | "S-2"
  | "12-10" | "10-8" | "8-6" | "6-4" | "4-2" | "8-4" | "8-2"
  | "12-F" | "10-F" | "8-F" | "6-F" | "4-F" | "2-F";

export interface BenchmarkedSection {
  /** Lengths +/- the Form King class benchmark, positive is faster than par. */
  vsClass: number;
  vsAllAvg: number;
  vsTrack: number;
  vsField: number;
  vsLeader: number;
  vsWinner: number;
  raceRank?: number;
}

export interface BenchmarkedRun {
  dataStage: string;
  /** Overall time performance in lengths +/- the class benchmark. */
  vsClass: number;
  vsAllAvg: number;
  vsTrack: number;
  /** Last 600m speed as a percentage of speed to the 600m. */
  finishingSpeed: number;
  /** 100 is class par. NEVER publish. */
  speedRating: number;
  raceRating?: number;
  atWeights: number;
  wfaRat: number;
  expectedRating?: number;
  pir2?: number;
  pir4?: number;
  pir6?: number;
  pir8?: number;
  pir10?: number;
  pir12?: number;
  raceRunners: number;
  sp?: number;
  bsp?: number;
  firmOrDrift?: number;
  sections: Partial<Record<SectionKey, BenchmarkedSection>>;
}

export interface HorseResult {
  /** Official finishing position, 0 when the horse did not finish. */
  finishPosition: number;
  margin: number;
  startingPrice: number;
  betfairStartingPrice: number;
  bestToteWin?: number;
  toteWin?: number;
  totePlace?: number;
  /** Betfair place market dividend. */
  betfairPlaceDiv?: number;
  topFluc?: number;
  weight?: number;
}

export interface Speedmap {
  raceId: string;
  owner: string;
  custom: boolean;
  direction: string;
  expectedTempo?: ExpectedTempo;
  entries: SpeedmapEntry[];
}

export interface ExpectedTempo {
  /** e.g. "Slow to Average", "Fast". */
  description: string;
  minCategory: string;
  maxCategory: string;
  min?: string;
  max?: string;
}

export interface SpeedmapEntry {
  number: number;
  barrier: number;
  horse: string;
  breedingId: string;
  emergency: boolean;
  runInPrep: number;
  daysSinceLastRace: number;
  distanceChange: number;
  /** Median early speed in lengths vs benchmark, positive is faster. */
  medianEarlyVsBenchmark?: number;
  earlySpeedValues?: {
    /** 1-10 when type is SPEED_FIGURE. */
    overall: number;
    type: "SPEED_FIGURE" | "RAW" | string;
    pir?: number;
    gap?: number;
    benchmark?: number;
  };
}

/** GET /b2c/horses/{id}: the horse and its career, most recent run first. */
export interface HorseForm {
  id: string;
  horse: { name: string; sire?: string; dam?: string; age?: number; type?: string };
  mostRecentTrainer?: string;
  pastEvents?: PastEvent[];
}
