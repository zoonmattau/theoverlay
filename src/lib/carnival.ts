/**
 * The big days ahead, for the way out: what a member leaving now would miss.
 * Dates by hand, a season at a time; past ones drop off on their own.
 * Spring 2026 set 5 Oct 2026 from each race's usual Saturday.
 */
export interface BigDay {
  date: string;
  races: string;
}

const DAYS: BigDay[] = [
  { date: "2026-10-10", races: "Caulfield Guineas" },
  { date: "2026-10-17", races: "The Everest and the Caulfield Cup" },
  { date: "2026-10-24", races: "Cox Plate" },
  { date: "2026-10-31", races: "Victoria Derby and the Golden Eagle" },
  { date: "2026-11-03", races: "Melbourne Cup" },
  { date: "2026-11-07", races: "Champions Stakes" },
];

/** The next few big days from today, Sydney time. */
export function bigDaysAhead(n = 4): BigDay[] {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  return DAYS.filter((d) => d.date >= today).slice(0, n);
}
