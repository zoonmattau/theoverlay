/**
 * PUBLIC domain types.
 *
 * Everything here is safe to send to the browser and to store in a publicly
 * readable table. If you are tempted to add a Form King rating, sectional
 * benchmark or form-history field to one of these, don't: that is exactly the
 * boundary the licence draws.
 */

export type SelectionTag = "top_overlay" | "prime_overlay" | "long_overlay" | "bet" | "lay";

/** Back when the market is longer than our price, lay when it is shorter. */
export type Signal = "back" | "lay";

export type MapPosition = "leader" | "on pace" | "midfield" | "back";
export type Tempo = "fast" | "even" | "slow";
export type GoingBand = "good" | "soft" | "heavy";
export type Factor =
  | "going"
  | "tempo"
  | "distance"
  | "track"
  | "weight"
  | "fresh"
  | "jockey"
  | "trainer"
  | "barrier"
  | "market";

export const FACTOR_LABEL: Record<Factor, string> = {
  going: "Going",
  tempo: "Tempo",
  distance: "Distance",
  track: "Track",
  weight: "Weight",
  fresh: "Freshness",
  jockey: "Jockey",
  trainer: "Trainer",
  barrier: "Barrier",
  market: "Field",
};

/**
 * Our ratings for one runner, all in benchmark points: a BM64 horse rates
 * about 64, a Group 1 horse about 120 plus. Each category reads as what the
 * horse rates when the race is run that way. Derived from several inputs
 * against the field, never a licensed number restated.
 */
export interface RunnerRatings {
  /** Peak recent ability. */
  class: number;
  /** Ability in each section of the race. */
  early: number;
  mid: number;
  late: number;
  /** Late rating when the early pace was hot. */
  pressure: number;
  /** Rating off a fast or slow tempo. */
  tempo: Record<"fast" | "slow", number>;
  /** Rating on each ground. */
  going: Record<GoingBand, number>;
  /** Rating at today's distance, give or take 200m. */
  distance: number;
  /** Rating at today's track. */
  track: number;
  /** The rating we price off, for today's conditions. */
  today: number;
  /**
   * How Today was built from Class, in points, so the card can say why.
   * Keys: going, tempo, distance, track, weight, fresh, jockey, trainer, market.
   */
  factors: Partial<Record<Factor, number>>;
  /** Runs behind the numbers. */
  runs: number;
  /** Predicted settling position, 1 = leads. */
  ppir: number;
  map: MapPosition;
}

/** One past start, public form-guide facts plus what our model made of it. */
export interface PublishedRun {
  /** yyyy-mm-dd */
  date: string;
  track?: string;
  distance: number;
  going?: string;
  /** Race class as printed, e.g. "Bm64" or "Mdn". */
  className?: string;
  finish?: number;
  runners?: number;
  /** Lengths beaten, 0 for the winner. */
  margin?: number;
  weight?: number;
  sp?: number;
  map?: MapPosition;
  /** The horse's own race time, seconds. */
  time?: number;
  /** Its last 600m, seconds, when Form King has it. */
  last600?: number;
  /** Lengths faster (+) or slower (-) than the class benchmark, for the race and for the last 600. */
  vsBench?: number;
  vsBench600?: number;
  /** What the run was worth on our scale. */
  points: number;
  /** Identifies the race, so runs can be matched across today's field. */
  raceKey?: string;
  /** Form King's ids, so the run can link to that race's page when we hold a card for the day. */
  raceId?: string;
  meetingId?: string;
  /** Runners in today's race that were in this one too, with where they finished and their lengths beaten. */
  met?: { tab: number; finish?: number; margin?: number }[];
  /** The first four home in that race, public results. */
  placings?: { pos: number; horse: string; margin?: number; weight?: number }[];
}

export interface HorseProfile {
  age?: number;
  sex?: string;
  sire?: string;
  dam?: string;
  daysSinceLastRun?: number;
  firstStarter: boolean;
  /** Starts-wins-seconds-thirds strings as printed in a form guide. */
  career?: string;
  firstUpForm?: string;
  secondUpForm?: string;
  /** Which run of the preparation this is, 1 first up. */
  runInPrep?: number;
  distanceForm?: string;
  trackForm?: string;
  /** Gear on today, e.g. "Blinkers". */
  gear?: string[];
  /** Gear changes today, e.g. "Blinkers on first time", "Winkers off". */
  gearChanges?: string[];
}

export interface PublishedRunner {
  tabNumber: number;
  horseName: string;
  /** Form King's breeding id, so the review can fetch the run afterwards. */
  horseId?: string;
  barrier: number;
  jockey?: string;
  trainer?: string;
  /** Their win rate over the last twelve months, per hundred rides or runners. */
  jockeyWin?: number;
  trainerWin?: number;
  weight?: number;
  /** Last five finishes, most recent last, e.g. "3x121". */
  form?: string;
  scratched: boolean;
  ratings: RunnerRatings;
  /** Our price: the form melded with the market. Ours, not Form King's. */
  ratedPrice: number;
  /** Our price from the form alone, before the market had a say. */
  formPrice?: number;
  /** Our model's win probability, 0-1. */
  ratedProbability: number;
  /** Best market price we saw at publish time. */
  marketPrice?: number;
  /** Form King's codes for the bookmakers holding that price. */
  bookies?: string[];
  /** Average price across bookmakers now. */
  marketAvg?: number;
  /** Average price at market open, so a move is visible. */
  marketOpen?: number;
  /** Percentage points of implied chance since open, negative is a drift. */
  marketMove?: number;
  /** When Form King last saw the price move, ISO. */
  marketAt?: string;
  /** Our win chance minus the market's implied chance, e.g. 0.05 for $4 rated against $5. */
  edge?: number;
  /** 1-4 for our top four; null otherwise. */
  rank: number | null;
  /** Set when the gap to the market is big enough to act on. */
  signal?: Signal;
  /** A Prime Overlay: a bet with the biggest edges on the card. */
  prime?: boolean;
  /** One sentence on why it is in the top four. Only set for ranked runners. */
  why?: string;
  /** Official finishing position once the race is resulted. */
  finishPosition?: number;
  horse?: HorseProfile;
  /** Most recent first, up to six. */
  runs?: PublishedRun[];
}

export interface Placing {
  position: number;
  tabNumber: number;
  /** Lengths behind the winner, 0 for the winner. */
  margin?: number;
  /** Official starting price. */
  sp?: number;
  bsp?: number;
  /** TAB win dividend, winner only. */
  win?: number;
  /** TAB place dividend, first three only. */
  place?: number;
}

export interface RacePace {
  tempo: Tempo;
  /** 0-1, how much early speed is in the race. */
  pressure: number;
}

export interface PublishedRace {
  raceId: string;
  meetingId: string;
  raceNumber: number;
  name: string;
  distance: number;
  className?: string;
  /** Benchmark points the class sits at. */
  classPoints: number;
  going: GoingBand;
  /** Condition as printed, e.g. "Heavy 9". */
  goingText?: string;
  jumpTime?: string;
  prizeMoney?: number;
  runners: PublishedRunner[];
  pace: RacePace;
  /** Tab numbers of the first four home, once the race is resulted. */
  result?: number[];
  /** The first four with their dividends, once the race is resulted. */
  placings?: Placing[];
  /** Model confidence in this race, 0-1. Low = we are guessing. */
  confidence: number;
  /** One sentence on what decides the race. */
  verdict: string;
}

export interface PublishedMeeting {
  meetingId: string;
  date: string;
  track: string;
  state: string;
  code: "T" | "H" | "G";
  trackCondition?: string;
  railPosition?: string;
  weather?: string;
  races: PublishedRace[];
}

export interface Selection {
  tag: SelectionTag;
  meetingId: string;
  track: string;
  raceId: string;
  raceNumber: number;
  tabNumber: number;
  horseName: string;
  ratedPrice: number;
  ratedProbability?: number;
  marketPrice?: number;
  /** Form King's codes for the bookmakers holding the market price. */
  bookies?: string[];
  marketAvg?: number;
  marketOpen?: number;
  marketMove?: number;
  marketAt?: string;
  edge?: number;
  comment?: string;
  /** Finishing position once the race is resulted, 0 for did not finish. */
  finishPosition?: number;
  /** ISO jump time, for the countdown on the card. */
  jumpTime?: string;
}
